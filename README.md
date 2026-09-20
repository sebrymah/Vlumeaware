# Vlumeaware

Phishing simulation and security awareness platform — Vlumetech LTD.
A paid add-on to Vlumetech's existing awareness curriculum and VAPT services,
targeted at Nigerian SME and mid-market clients.

Built from `VLUMEAWARE_CONTEXT.md`. The `PRD.md` and `ARCHITECTURE.md` that
document referenced were not present on this machine, so anything they contain
beyond the context doc has not been incorporated.

---

## What runs today

All seven build-order stages from the context doc (§11) are implemented, with
tenant isolation first as specified.

| Stage | State |
|---|---|
| 1. Data model + tenant isolation test suite | Done — 96 tests, ORM-level enforcement |
| 2. Consent gate + tenant/employee CRUD | Done — server-side gate, CSV bulk upload |
| 3. Scenario generator | Done — Claude drafts, admin edits, superadmin approves |
| 4. Send + tracking pipeline | Done — BullMQ worker, open/click/report endpoints |
| 5. Landing pages + routing rules | Done — white-labeled teachable moment, auto-assignment |
| 6. Reporting dashboard | Done — aggregate metrics + Claude board narrative |
| 7. Kill switch + admin polish | Done — halts queued and in-flight sends |

### P0 acceptance criteria (§12)

| Criterion | Verified by |
|---|---|
| Campaign creation blocked until agreement signed | `ConsentGuard`, `test/consent-gate.spec.ts`, end-to-end blocked→upload→unblocked |
| Querying as Tenant A never returns Tenant B records | `test/tenant-isolation.spec.ts` (34 assertions) |
| Admin can generate, edit and save a scenario | `/admin/scenarios` with live preview |
| Every send individually trackable | `sends.unique_tracking_token`, one row per employee per scenario |
| Teachable-moment page renders branding + the lure | `/t/:token`, server-rendered |
| Routing rules drive module assignment | `training_routing_rules`, one rule per scenario |
| Kill switch halts in-progress send in one action | Verified: 305 queued, 15 delivered, 290 halted |
| Dashboard shows rates, trend and Claude summary | `/admin/campaigns/:id`, `/dashboard` |

## Content & authoring (parity features)

Beyond the v1 core, three authoring capabilities matching what KnowBe4,
Proofpoint, Cofense, SoSafe, uSecure and Hoxhunt ship:

- **Your own awareness content.** Upload a training video (to S3, or local disk
  in dev) or link one hosted on your LMS, under `/admin/content`. Routing rules
  now point a scenario at a real module, and the teachable-moment page plays the
  assigned video. `POST /tenants/:id/training-modules/upload` (multipart) and
  `/link`.
- **Compose the phishing mail yourself.** `/admin/scenarios` has a manual
  composer alongside Claude generation — a blank editable draft with live
  preview and tracking-placeholder validation. Saved as `createdByClaude:false`.
- **A catalogue of ready-made simulations.** A global, read-only phishing
  template library (`/admin/templates`, `GET /phishing-templates`) grouped by
  category and difficulty. Clone one into your tenant library
  (`POST /tenants/:id/scenarios/from-template/:templateId`) where it becomes an
  ordinary editable, unapproved scenario. Templates are original content written
  for this build, not copied from any vendor.

- **Knowledge-check quizzes.** Author a quiz attached to a training video or a
  campaign (`/admin/quizzes`), question by question or by CSV upload
  (`prompt, option1..optionN, correct, explanation`). After the reveal video,
  the employee takes it: `GET /track/quiz/:token` serves the questions **without
  the answers**, `POST /track/quiz/:token` scores server-side, records the
  attempt, and on a pass marks that send's training assignment complete. Pass
  rate and average score flow into the campaign report.
- **Industry coverage.** The catalogue spans 20 templates across 15 industries
  (agriculture, healthcare, education, oil & gas, telecom, government,
  manufacturing, logistics, tech/SaaS, retail, hospitality, NGO, finance…),
  filterable by industry, category and difficulty.

The template catalogue is **global by design** — it has no `tenant_id` and sits
outside the tenant guard, like `tenants` and `users`. `training_modules`,
`quizzes`, `quiz_questions` and `quiz_attempts` are tenant-scoped and in the
guard allowlist; the isolation suite covers them. Quiz answers are never sent to
the browser — questions are served without the correct index and scored on the
server.

---

## Programme features

Ten capabilities beyond the core loop:

1. **Scheduling & recurring campaigns.** Set a send time (auto-launched by a
   scheduler tick) and an optional repeat interval; each occurrence clones the
   next as a scheduled draft. `scheduledSendAt`, `recurrenceDays`, plus a
   `/campaigns/:id/schedule` endpoint.
2. **Per-employee risk score & repeat-clicker tracking.** A running 0-100 score
   across all campaigns (`/employees/risk`), a repeat-clicker list, and one-click
   auto-enrol into a remediation module.
3. **Randomised drip delivery.** `sendWindowMinutes` spreads sends randomly
   across the window instead of one burst.
4. **Quiz retakes & completion gating.** `allowRetakes` / `maxAttempts`; a prior
   pass is final, a pass marks training complete.
5. **Certificates of completion.** Issued on a passed module quiz, downloadable
   as a dependency-free PDF, publicly verifiable by serial at `/verify/:serial`.
6. **Visual email composer.** A WYSIWYG editor for scenario bodies with
   one-click insertion of the tracking-link and employee-name placeholders, and
   a raw-HTML toggle.
7. **Report export & scheduled digests.** CSV export per campaign
   (`/reports/:id/export.csv`); an opt-in weekly email digest per tenant sent by
   a digest worker.
8. **Report-a-phish intake.** An inbound endpoint (`/intake/phish-report`) that
   matches a forwarded real email to an employee, flags it if it was actually one
   of our simulations, and lists reports per tenant.
9. **Audit log.** Sensitive actions (campaign create/launch/kill/schedule, and
   cross-tenant staff reads) are recorded and surfaced to the super-admin at
   `/super-admin/audit`.
10. **Deliverability preflight.** A pre-launch checklist (consent, employees,
    approved scenarios, sending domain, client IT allow-list confirmation) at
    `/campaigns/:id/preflight`, with the allow-list flag set per tenant.

`quizzes`, `certificates`, `phish_reports` and `training_modules` are all
tenant-scoped and in the guard allowlist; `audit_logs` carries a `tenant_id`
filter column but is a global append-only table, covered by an explicit
exception in the coverage test.

## Shared awareness-content library

Awareness videos come in two tiers:

- **Client-owned content** — a client admin uploads or links videos into their
  own tenant library (`/admin/content`). Private to that tenant; the super-admin
  can no longer create content inside a client's tenant.
- **Vlumetech shared library** — a GLOBAL, super-admin-curated catalogue
  (`shared_training_modules`, no `tenant_id`, outside the tenant guard like the
  phishing templates). The super-admin publishes at `/super-admin/library`; every
  client browses it on their Awareness content page and clicks "Add to my
  library" to clone an item (`POST /tenants/:id/training-modules/from-shared/:sharedId`).
  A clone references the same stored video — no binary duplication — and records
  its `sharedModuleId` origin.

Curating the shared library is super-admin only; browsing it is open to any
authenticated console user; cloning is client-admin only.

## License tiers & seat limits

The super-admin assigns each client a **license tier** (a label) and a **seat
limit** — the maximum number of employees that client may add — on the client's
detail page (`PATCH /tenants/:id/license`). Seats are the employee roster, since
client admins add employees while Vlumetech adds the console accounts.

Enforcement is at the employee-upload path: only *new* employees consume a seat
(updates to existing ones do not), and once the limit is reached the overage rows
are skipped with a clear "seat limit reached" reason rather than failing the whole
upload. A limit below the client's current headcount is refused. `null` = unlimited.
The client sees live usage on their Employees page (`GET /tenants/:id/seats`);
setting a license is super-admin only (client admin → 403).

## Two sign-in portals

Client staff and Vlumetech staff sign in at separate URLs:

- **Client portal** — `http://localhost:3000/login` — for `client_admin` and
  `client_viewer` accounts. The client console lives under `/client/*`.
- **Vlumetech staff (admin) portal** — `http://localhost:3000/admin` — for the
  `vlumetech_superadmin`. The staff console lives under `/super-admin/*`.

Each portal only accepts its own roles. Signing in with the wrong account is
refused without storing a session, and the page links the user to the correct
portal. Route guards send an unauthenticated visitor to the portal that matches
the area they were trying to reach, and sign-out returns each role to its own
portal. (Role boundaries are still enforced server-side; the portals are the
front door, not the lock.)

## Self-serve signup & free trial

Prospective clients can self-register at `/signup` (public, rate-limited),
creating a **Free-trial** workspace and their first `client_admin` account,
signed in immediately. The trial:

- **Explore-only for 7 days.** They can add employees (capped at **20 seats**),
  generate/browse scenarios, browse the shared library and configure routing —
  but **cannot create or launch campaigns**. Simulations unlock only after a
  Vlumetech admin approves the account *and* a signed NDPA agreement is on file
  (the consent gate still stands).
- **Read-only after day 7** if still unapproved: they can view, but not add
  employees or author content, until approved.
- **Approval** by Vlumetech staff (`POST /tenants/:id/approve`, from the
  "Pending signups" queue on the staff console) flips it to a full account and
  can set a paid tier/seat limit in the same step.

Access level is computed centrally (`GET /tenants/:id/trial`) and enforced by two
guards — `ApprovedTenantGuard` (campaigns) and `WritableTenantGuard` (writes when
read-only). A trial banner shows the state across the client console. Existing
staff-onboarded tenants are unaffected (`selfSignup = false` → full access).

## Running it

Requires Docker and Node 22+.

```bash
docker compose up -d postgres postgres-test redis
```

```bash
cd api && npm install && cp .env.example .env
```

Set `JWT_SECRET` in `api/.env` to 32+ random characters, then:

```bash
cd api && npx prisma migrate dev && npm run seed
```

```bash
cd api && npm run build && npm start
```

In a second terminal:

```bash
cd web && npm install && cp .env.local.example .env.local && npm run dev
```

The console is at http://localhost:3000, the API at http://localhost:3001.

### Seeded accounts

Password for all four: `vlumeaware-dev-password`

| Email | Role | Notes |
|---|---|---|
| `it@vlumetech.com.ng` | `vlumetech_superadmin` | Cross-client console |
| `admin@kaduna.test` | `client_admin` | Agreement signed — campaigns allowed |
| `viewer@kaduna.test` | `client_viewer` | Read-only reporting |
| `admin@lagos.test` | `client_admin` | **No agreement** — campaigns blocked, to see the gate |

### Tests

The suite needs **Node >= 24.9** — Jest cannot load `@nestjs/common` (ESM) on
anything older, and every suite that imports it fails to run with an error that
does not mention the Node version. `.nvmrc` pins it and `npm test` refuses to
start on the wrong one. The application is unaffected and still ships on
`node:22-slim`.

```bash
nvm use && cd api && npm test
```

The isolation suite needs `postgres-test` up (port 5433) with migrations applied:

```bash
cd api && DATABASE_URL="postgresql://vlumeaware:vlumeaware@localhost:5433/vlumeaware_test?schema=public" npx prisma migrate deploy
```

### Worker

The API process registers the send processor, so a single process is enough in
development. In production run the worker separately — same image, different
entrypoint:

```bash
cd api && npm run start:worker
```

---

## How tenant isolation works

The context doc calls cross-tenant leakage the biggest risk and asks for
enforcement at the ORM level rather than in application logic. That is a Prisma
client extension in [`tenant-guard.extension.ts`](api/src/common/prisma/tenant-guard.extension.ts),
driven by an `AsyncLocalStorage` tenant context.

- Nine models carry `tenant_id`. A query against any of them with **no tenant in
  the async context throws** rather than returning rows. Fail closed, not open.
- `TenantScopeInterceptor` opens the context from the **verified JWT**, never
  from anything the caller supplies. A `:tenantId` in the URL is checked against
  the token, so URL tampering gets a 403.
- The tenant filter is merged into the top level of `where`. Prisma ANDs
  top-level keys, so the filtering is equivalent to an `AND` wrapper while
  preserving the unique field that `update`, `delete` and `findUnique` require
  there. A caller-supplied `tenantId` that is not theirs is retained as an extra
  `AND` term, so the query matches nothing instead of silently answering about a
  different tenant.
- Creates are stamped with the acting tenant; a forged `tenantId` is overwritten.
- Updates cannot reassign a row's tenant — that throws.
- `runAsSystem(reason, fn)` is the only way out, used in five places, each with a
  stated reason: login (resolving a user before a tenant is known), tracking-token
  resolution, tenant-branding reads, the consent gate, and the superadmin
  cross-client overview.

Two guards keep this honest as the schema grows:

- `test/tenant-guard-coverage.spec.ts` parses `schema.prisma` and **fails the
  build** if a model gains a `tenant_id` column without being added to the
  extension's allowlist. This is the regression that would otherwise ship
  silently.
- The same spec asserts the schema never grows a column that stores submitted
  credential values (see Deviations below).

### One deviation from the documented data model

The context doc (§8) omits `tenant_id` from `campaign_scenarios`, `sends` and
`training_assignments`, expecting them to be scoped "via join". A Prisma client
extension cannot enforce join-based scoping, so `tenant_id` is denormalised onto
those three tables. Every column the doc specifies is retained; this only adds
one. Without it, the three highest-traffic tables in the system — including
`sends`, the heart of it — would fall back to application-level scoping, which
is exactly what §8 says not to rely on.

---

## Security posture

- **Credential capture is metadata only (legal-cleared, §13).** The simulated
  login page derives non-reversible metrics in the browser — field lengths,
  whether the entry was email-shaped — and posts only those. The typed username
  and password never reach the server: `POST /track/submit/:token` accepts a
  strict whitelist of integers and one boolean, so `forbidNonWhitelisted`
  returns 400 to anything that tries to send a real value. `time_to_submit_ms`
  is computed server-side from the click. Stored in `credential_submissions`
  (tenant-scoped); `sends.credentials_submitted` stays as the summary flag.
  Tests assert the table has no column capable of holding a secret.
- **Employee names are HTML-escaped** when rendered into a scenario body. A
  scenario author is trusted with HTML; an imported CSV is not.
- **SES is opt-in.** The mailer falls back to a logging implementation unless
  `MAILER=ses` is set explicitly, so a misconfigured deploy cannot send real
  email to a client's employees.
- **Rate limiting** is in-house (`RateLimitGuard`): 10/min on login,
  120/min on the public tracking endpoints. `@nestjs/throttler` was dropped
  because it pins Nest to a major line with unpatched advisories. The counter is
  in-process — move it to the Redis instance the queue already uses before
  running more than one API task.
- **Tracking endpoints never leak token validity.** An unknown token still
  returns a pixel and still redirects.
- **`npm audit` reports zero vulnerabilities** in both `api` and `web`.
  Two `overrides` in `api/package.json` carry that: `multer@^2.3.0` (DoS via
  crafted multipart field names) and `deepmerge-ts@^8` (stack exhaustion, dev
  tooling only). Uploads are additionally constrained in
  [`upload-limits.ts`](api/src/common/upload/upload-limits.ts) — one file, four
  fields, 64-byte field names — which closes the multer vectors directly rather
  than relying only on the version bump.

### Still open before production

- NDPA authorization agreement text needs Nigerian legal review (§13).
- Credential capture is built at the metadata-only fidelity legal cleared.
  Storing typed values was explicitly declined as an unnecessary breach target;
  revisit only with a fresh, specific legal decision.
- Report-a-phish is the forwarding-address model (§13). The endpoint exists;
  the monitored mailbox and its parser do not.
- Rate limiting must move to Redis before horizontal scaling.
- SES dedicated IPs, the separate tracking domain, and per-client gateway
  allowlisting are deployment work, not code. Build the allowlist step into the
  onboarding checklist (§4).
- No SSO in v1, per §5.

---

## Layout

```
api/
  prisma/schema.prisma          data model, 10 models + audit log
  prisma/seed.ts                two clients, one gated, with demo sends
  src/common/prisma/            tenant context + guard extension
  src/common/auth/              JWT, role guards, tenant-scope interceptor
  src/common/consent/           NDPA consent gate
  src/common/ratelimit/         in-house rate limiter
  src/common/upload/            multer hardening
  src/modules/tenants/          onboarding, agreements, client accounts
  src/modules/employees/        CSV bulk upload
  src/modules/scenarios/        Claude generation, template library, approval
  src/modules/campaigns/        create, launch, pause, resume, kill
  src/modules/tracking/         open / click / report / submit + teachable data
  src/modules/training/         routing rules, auto-assignment
  src/modules/reports/          metrics, trend, Claude narrative
  src/providers/                Claude, SES + log mailer, S3 + local storage
  src/queue/                    BullMQ send processor (honours kill switch)
  test/                         isolation, coverage, consent, render
web/
  app/login                     sign in
  app/super-admin               client portfolio, per-client management
  app/client                    campaigns, scenarios, templates, content, quizzes, routing
  app/admin                     Vlumetech staff (super-admin) login portal
  app/dashboard                 read-only viewer reporting
  app/t/[token]/login           simulated login page (metadata-only capture)
  app/t/[token]                 public white-labeled teachable moment
```

## Deliberately not built

Per §3: no SIEM or mail-gateway function, no GoPhish feature parity, no
real-time SOC integration, no self-serve signup.
