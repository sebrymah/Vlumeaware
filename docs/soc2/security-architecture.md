# Vlumeaware — Security architecture & SOC 2 readiness

_Owner: Vlumetech LTD. Scope: the Vlumeaware phishing-simulation & awareness platform (NestJS API, Next.js console, Postgres/Supabase)._

This document describes how access control, auditing, and tenant isolation
actually work in the codebase, assesses them against SOC 2 (Trust Services
Criteria, primarily CC6 Logical Access and CC7 System Operations), and records
the remediation roadmap. The companion [rbac-matrix.md](./rbac-matrix.md) is the
generated, authoritative list of every route and the roles that may call it.

---

## 1. Access control (RBAC)

### How it works
- **Identity** is a signed JWT carrying `{ sub, email, role, tenantId? }`
  ([roles.ts](../../api/src/common/auth/roles.ts)). `tenantId` is mandatory for
  client roles and absent for Vlumetech staff.
- **Three roles**: `vlumetech_superadmin` (our staff), `client_admin`
  (customer read+write), `client_viewer` (customer read-only).
- **Four global guards run on every request**, in order
  ([app.module.ts](../../api/src/app.module.ts)):
  `JwtAuthGuard` → `RolesGuard` → `MfaEnforcedGuard` → `RateLimitGuard`, then the
  `TenantScopeInterceptor` establishes data scope.
- **Authorization is declarative per route** via `@Roles(...)`; `@Public()`
  marks the few unauthenticated endpoints. The
  [RolesGuard](../../api/src/common/auth/roles.guard.ts) denies any role not in
  the handler's allow-list.
- **Separation of concerns**: role gates the *verb* (which action), tenant scope
  gates the *rows* (whose data). A `client_admin` may "update campaign," but the
  tenant guard guarantees it is their campaign.

### Assessment
Sound and idiomatic. Coarse-grained (three roles, route-level, no per-field
control), which is acceptable for SOC 2 — the criteria want role-based,
least-privilege, reviewed access, not fine-grained ABAC.

### Evidence for auditors
- `npm run rbac:matrix` regenerates [rbac-matrix.md](./rbac-matrix.md) from the
  controllers — 145 handlers, each mapped to allowed roles, with the 21
  unauthenticated (`@Public`) endpoints listed for deliberate review. This is
  the access-policy evidence, generated from source rather than maintained by
  hand.

### Roadmap
- **P2** — Review the RBAC matrix each quarter (change-management control) and
  keep the generated file in the repo as the point-in-time record.
- **P3** — Centralize policy in one `permissions.ts` map so the matrix is
  authoritative rather than reconstructed; optionally add finer client roles
  (e.g. campaign-operator without user management) if customers ask.

---

## 2. Audit log

### How it works
- `AuditLog` is a **global, append-only** table
  (`id, tenantId?, actorId?, actorRole?, action, detail?, createdAt`).
- [AuditService.record()](../../api/src/common/audit/audit.service.ts) writes via
  `runAsSystem` (the table is not tenant-scoped), takes actor/tenant from the
  request scope, and **never throws** — an audit failure is logged but does not
  break the action it describes.
- Reads are super-admin only, cross-tenant
  ([audit.controller.ts](../../api/src/common/audit/audit.controller.ts)).

### Coverage (after this change set)
- **Administrative**: `tenant.signup/approve/license/delete`,
  `license.issue/redeem/revoke`, `campaign.create/schedule/launch/kill`.
- **Authentication** (new): `auth.login`, `auth.login_failed`, `auth.lockout`,
  `auth.mfa_challenged`, `auth.mfa_enrolled`, `auth.mfa_disabled`,
  `auth.password_changed`.
- **Privileged access** (new): `system.cross_tenant_access` — every time a
  super-admin reads or acts across tenants from the console, persisted from the
  tenant-scope escape hatch (previously only in the log stream).
- **Data export** (new, representative): `report.export_csv`.

### Assessment
The authentication and privileged-access gaps that would have failed a SOC 2
review (CC6.1/CC7.2 — logging security events and privileged use) are now
closed. Two hardening items remain before the trail is audit-grade:

### Roadmap
- **P1 — Finish data-access/export coverage.** Add `*.export`/`*.download`
  events to the remaining sensitive routes, notably
  `GET /tenants/:tenantId/employees/risk/export.csv`, certificate PDF downloads,
  and credential-submission views. The pattern is established
  (`this.audit.record('report.export_csv', …)`); this is mechanical.
- **P1 — Tamper-evidence.** "Append-only" is currently by convention only. Add a
  hash chain (`hash = sha256(prevHash || canonicalRow)`) or ship audit rows to
  append-only external storage (e.g. an S3 Object-Lock bucket / log pipeline).
  Note: a single in-process chain breaks if the API scales to multiple
  instances — order by a DB sequence and hash `(seq, prevHash, row)`, or prefer
  external WORM storage. Cheap now, expensive to retrofit.
- **P2 — Retention.** Define retention (recommend 13 months) plus an immutable
  archive, and document it. `list()` already caps page size at 1000.
- **P2 — Alert on audit-write failure** for high-value events (auth, PII), so a
  swallowed write is at least noticed.

---

## 3. Tenant isolation (client-to-client)

### How it works — the strongest control in the system
Isolation is enforced at the **query layer**, not scattered through application
code:
1. **Per-request scope**: the
   [TenantScopeInterceptor](../../api/src/common/auth/tenant-scope.interceptor.ts)
   opens an `AsyncLocalStorage` scope pinned to the caller's `tenantId` from the
   verified JWT. A client addressing a different tenant in the URL gets
   `403 Tenant mismatch`.
2. **Query-layer enforcement**: the
   [tenantGuardExtension](../../api/src/common/prisma/tenant-guard.extension.ts)
   intercepts **every** Prisma op on the 22 tenant-scoped models — injecting
   `tenantId` into `where` for reads/updates/deletes and into `data` for
   creates, **blocking tenant reassignment**, and **failing closed** (a scoped
   query with no tenant in context throws rather than leaking rows).
3. **Build-time safety net**: `test/tenant-guard-coverage.spec.ts` fails the
   build if a new model gets a `tenant_id` column without being registered.
4. **Narrow escape hatch**: `runAsSystem` bypasses scoping only for super-admin
   cross-tenant views and public token lookups — and now every human use is
   persisted to the audit log (§2).

### Assessment
Architecturally excellent, fail-closed, regression-guarded — directly satisfies
CC6.1 logical segregation, and better than the usual "remember to add
`where: { tenantId }`" approach.

**Verified**: the only raw SQL in the codebase is a migration health-check
([schema-guard.ts](../../api/src/common/prisma/schema-guard.ts)) touching no
tenant data — so there are no `$queryRaw` isolation holes today.

**Residual risk**: isolation lives entirely in the application layer (Prisma).
Anything reaching the database *not* through the extended client — future raw
SQL, a second service, an analytics tool, a direct connection — has no tenant
enforcement. The guard is a property of the code path, not the data.

### Roadmap
- **P1 — Postgres Row-Level Security as a backstop.** Supabase supports RLS
  natively. Enable it on the tenant-scoped tables with a policy keyed on a
  session variable (`SET app.tenant_id`) set from the same scope, so isolation
  holds even if something bypasses Prisma. Strong defense-in-depth and a clean
  "segregation enforced at the data tier" story for auditors.
- **P2 — CI cross-tenant test**: acting as tenant A, attempt to read/update
  tenant B's rows by id and assert deny/empty — living proof for auditors.
- **P2 — Guard raw SQL**: a lint/CI rule flagging any new `$queryRaw` on a
  tenant table.
- **P3** — A test asserting a `client_*` request can never enter `runAsSystem`
  scope.

---

## Summary

| Area | State | Priority gap |
|---|---|---|
| RBAC | ✅ Sound, coarse | Quarterly matrix review (generated) |
| Tenant isolation | ✅ Strongest control | App-layer only — add Postgres RLS backstop (P1) |
| Audit log | ⬆️ Materially improved | Finish export coverage + add tamper-evidence (P1) |

**This change set** added authentication, privileged-access, and export audit
events, persisted cross-tenant escapes to the durable trail, and generated the
RBAC matrix. The remaining P1 items — full export coverage, audit tamper-
evidence, and Postgres RLS — are the path to an audit-ready posture.

_Related: the exposed Supabase DB password rotation remains an open security
item, tracked separately, to be done once the test phase ends._
