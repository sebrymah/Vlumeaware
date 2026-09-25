# Vlumeaware — full application review

**Reviewed:** `api/` (NestJS 12 + Prisma 6 + BullMQ), `web/` (Next.js 16 / React 19 console), `website/` (static marketing site), `docs/`, deployment config and git history.
**Scale:** ~26,000 lines of first-party source, 67 commits, single `main` branch, no CI.
**Date of review:** 2026-09-25.

> **Status update — Batch 1 applied (2026-09-25).** C1, C2, H1, H2, H3 and the minimal CI half of H6/H7 are fixed in the working tree. See "Batch 1 — what changed" at the end of this document for what was done and how each fix was verified. The findings below are otherwise unmodified, so the report still reads as the review that motivated the work.

This review was done by reading the source and by **executing** the code where a claim was checkable: the API test suite was run against real Postgres, both HTML sanitizers were executed against attack payloads, both projects were typechecked, and the web console was built for production.

---

## 1. What this application is

A multi-tenant phishing-simulation and security-awareness platform (Vlumetech LTD, Nigeria). It has four moving parts:

| Part | Stack | Role |
|---|---|---|
| `api/` | NestJS 12, Prisma 6, Postgres, BullMQ + Redis | All business logic, tenant isolation, tracking, mail |
| `web/` | Next.js 16 App Router, React 19, Tailwind | Two consoles (client + Vlumetech staff) and five public learner pages |
| `website/` | Static HTML/CSS/JS | Marketing site — **not deployed by anything in the repo** |
| `docs/` | PRD, test plan (HTML/PDF/DOCX) | Product documents, substantially out of date |

The core loop is: upload an employee roster → author or clone a phishing scenario → launch a campaign → BullMQ worker sends mail with a per-recipient tracking token → opens/clicks/credential-submissions/reports are recorded → a white-labelled "teachable moment" page assigns training → a quiz issues a certificate → a dashboard reports rates and a risk score.

---

## 2. Architecture: the parts that are genuinely well built

These are not cosmetic; they are the load-bearing decisions and they hold up.

- **Tenant isolation is enforced at the ORM layer, fail-closed.** `api/src/common/prisma/tenant-guard.extension.ts` is a Prisma client extension driven by an `AsyncLocalStorage` scope. A query on any of 20 tenant-scoped models with **no tenant in the async context throws** rather than returning rows. The tenant is taken from the **verified JWT** by `TenantScopeInterceptor`, never from the URL — a `:tenantId` that disagrees with the token is a 403. Creates are stamped, reassignment to another tenant throws, and a caller-supplied `tenantId` that isn't theirs is retained as an extra `AND` term so the query matches nothing instead of answering about a different tenant.
- **A schema-drift guard that actually does what it claims.** `api/test/tenant-guard-coverage.spec.ts` parses `schema.prisma` and asserts set equality with the extension's allowlist. I verified parity independently: 21 models carry `tenant_id`, `AuditLog` is the one documented exception, 20 are allowlisted — they match exactly. This is the right way to stop the classic "new table forgot the guard" regression.
- **Credential capture is metadata-only, and guarded statically.** `POST /track/submit/:token` accepts a strict whitelist of two integers and one boolean; `forbidNonWhitelisted` rejects anything else, so a typed username or password cannot reach the server. `credential-capture-static.spec.ts` fails if the `CredentialSubmission` model ever grows a field capable of holding a secret. This is a legal-risk decision made correctly.
- **The kill switch is honoured per job, immediately before send** (`send.processor.ts:43`), so jobs already queued do not go out after a halt.
- **Consent gate, trial gate and licence expiry are server-side.** `ConsentGuard` refuses campaign creation until an NDPA agreement is on file; `ApprovedTenantGuard` blocks campaigns for unapproved self-signup trials; `WritableTenantGuard` makes a lapsed trial read-only. All three compute from the database, not the UI.
- **Secrets at rest are handled well.** Licence keys are stored as SHA-256 of a normalised key with ~98 bits of entropy and are shown once. JWT secret length is enforced at boot.
- **Uploads are defended in depth.** Multer limits (1 file, 6 fields, 64-byte field names) close the known unpatched advisory vectors directly, plus two `overrides`.
- **`npm audit` is clean in both packages** — verified live: 0 vulnerabilities in `api` and `web`.
- **The test suite is real and it passes.** I ran it against a migrated Postgres: **20 suites, 170 tests, all passing in ~7 s**. It uses a real database, constructs the production extension, and covers tenant isolation, seat limits, licence tokens, quiz scoring, certificate issuance, the consent gate, preflight and signup/trial. There are zero skipped tests.

---

## 3. Findings by severity

### CRITICAL

#### C1. Stored XSS — the scenario/template sanitizer is bypassable, and the console renders its output with `dangerouslySetInnerHTML`

`api/src/common/security/sanitize-html.ts` guards scenario and phishing-template bodies. Its `safeUrl` decodes **only decimal** HTML entities:

```ts
const decoded = v.replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(Number(d))).replace(/\s+/g, '');
if (/^(javascript|data|vbscript|file):/i.test(decoded)) return null;
```

Hex, named and C0-control obfuscations all survive. Executed against the real function:

| Input | Output | Verdict |
|---|---|---|
| `<a href="&#106;avascript:alert(1)">` | href dropped | correct |
| `<a href="&#x6a;avascript:alert(1)">` | **href kept verbatim** | **bypass** |
| `<a href="java&Tab;script:alert(1)">` | **href kept verbatim** | **bypass** |
| `<a href="javascript&colon;alert(1)">` | **href kept verbatim** | **bypass** |
| `<img src="&#x6a;avascript:alert(1)">` | **src kept verbatim** | **bypass** |

The browser decodes the entity inside the attribute into `javascript:`, and React does not sanitize `dangerouslySetInnerHTML`, so React's own `javascript:` guard is never consulted.

**Why it is critical rather than cosmetic:**

1. The poisoned body is stored (sanitized on save, bypass passes through) and then rendered as live HTML in six places: `web/app/client/scenarios/page.tsx:279`, `web/app/client/templates/page.tsx:191`, `web/app/super-admin/scenarios/page.tsx:289`, `web/app/client/page.tsx:637`, `web/app/t/[token]/login/page.tsx:68`.
2. The session is a bearer token in `localStorage` (`web/lib/session.ts:27`), so any script running on the console origin can read it and act as that user.
3. The console CSP deliberately keeps `script-src 'self' 'unsafe-inline'` (`web/proxy.ts:50`), so a `javascript:` URL and inline handlers both execute — the CSP does not backstop this.
4. The phishing-template catalogue is **global** (`POST /phishing-templates`, superadmin-only, sanitized with the same broken function). A poisoned catalogue entry executes for every client that previews it.

**The fix already exists in the sibling file.** `sanitize-landing-html.ts:81-92` decodes hex, decimal and named entities and strips C0 controls before the scheme allow-list; I confirmed all four payloads above are correctly rejected there. Commit `c00b7f6` ("Harden landing-page sanitizer: entity-encoded schemes and unclosed `<style>`") fixed the landing sanitizer and left `sanitize-html.ts` untouched. Port `decodeEntities`/`safeUrl` across, and sanitize at render as well as on save.

**The test that should have caught this tests only the decimal form** (`api/test/sanitize-html.spec.ts:26`), while the landing spec has an explicit hex/named-entity case (`sanitize-landing-html.spec.ts:59-63`). The same bug class is tested in one file and not the other.

#### C2. Unsanitized draft HTML is rendered in the console (no click required)

`web/app/client/scenarios/page.tsx:279` renders `draft.bodyHtml` directly with `dangerouslySetInnerHTML`, but sanitization happens only when the scenario is **saved** (`scenarios.service.ts:38,56`). A pasted body — or the AI generator's response, which is stored straight into the draft (line 121-126) from user-controlled `industry`/`context` prompt inputs — is live markup on preview. An `<img src=x onerror=…>` here executes on render, with no click needed, because the console CSP allows inline handlers.

### HIGH

#### H1. "Mandatory" MFA is not enforced anywhere server-side

`AuthService.login` returns a **full access token** for staff accounts that have not enrolled in MFA, plus an advisory flag:

```ts
return { ...this.issue({ sub: staff.id, ... }), mfaEnrollmentRequired: true };
```

The only consumer of `mfaEnrollmentRequired` in the entire repo is `web/components/portal-login.tsx:55` — a UI redirect. A staff account can authenticate with a password alone against the API directly, or simply navigate past the enrolment screen. The same applies to a client that sets `Tenant.requireMfa`. `jwt.strategy.ts` only rejects `typ === 'mfa'` challenge tokens. The console copy at `web/app/super-admin/security/page.tsx:120-122` describes a control that does not exist. The schema comment calls staff MFA "mandatory (review R8)"; it is currently advisory.

#### H2. The employee `/portal` page is broken in production by its own CSP

`web/proxy.ts:30` classifies public pages by prefix:

```ts
const isPublic = p.startsWith('/t/') || p.startsWith('/learn/') || p.startsWith('/portal');
```

`'/portal'.startsWith('/portal')` is true, so the bare `/portal` route receives the strict policy `script-src 'self' 'nonce-…' 'strict-dynamic'` with no `'unsafe-inline'`. But `/portal` is **statically prerendered** (confirmed both by the production build route table — `○ /portal` — and by `web/.next/prerender-manifest.json`), and Next cannot inject a nonce into static HTML.

I verified this against the actual build output:

```
.next/server/app/portal.html:  <script …> tags: 10   |   tags carrying a nonce: 0
flight data: "nonce":"$undefined"
```

Under CSP3, `'strict-dynamic'` causes `'self'` to be **ignored** for scripts, so those ten nonce-less bundles are blocked. The page renders server-side HTML but never hydrates — the "Email me a sign-in link" form does nothing. Next's own bundled documentation says it plainly: *"Static pages are generated at build time, when no request or response headers exist—so no nonce can be injected."*

Fix: match `'/portal/'` rather than `'/portal'`, or opt the page into dynamic rendering with `await connection()`.

#### H3. Public, unauthenticated endpoints that send mail or write rows, with no rate limiting

`POST /portal/request-link` is `@Public()`, has **no `@Throttle`**, and for every matching employee row it overwrites the employee's portal token and sends an email. Consequences: anyone can mail-bomb an employee, and because each call overwrites `portalToken`, an attacker can continuously invalidate a victim's sign-in links (portal denial of service). `/learn/:token/complete`, `/verify/:serial` and `/track/*` (partly) are likewise unthrottled.

Most importantly, `POST /intake/phish-report` is public and its comment claims it is *"authenticated by a shared secret header at the gateway"* — **no such check exists in the code**. Anyone can create phish-report rows for any enrolled employee address across any tenant, with attacker-chosen subject, sender and body.

#### H4. Rate limiting is per-process and keyed on an address that is wrong behind a proxy

`RateLimitGuard` keeps a `Map` in process memory — the README acknowledges this and says to move it to Redis before scaling out. The unacknowledged problem is the key:

```ts
const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
```

Express only honours `X-Forwarded-For` when `trust proxy` is set, and **it is not set** (`api/src/main.ts` has no `app.set('trust proxy', …)`). Behind Render/Vercel/any load balancer, `req.ip` is therefore the *proxy's* address, so:

- the 10/min login limit becomes a **global** 10/min shared by all users, and
- the per-account lockout (5 failures → 15 min) makes it trivial to lock the platform superadmin out of their own console.

This is a production-only failure mode: it works fine in local development and breaks exactly where it matters.

#### H5. The audit trail does not record what the README says it records

The README states that "cross-tenant staff reads" are recorded and surfaced at `/super-admin/audit`. In fact `AuditService.record` is only called from write paths (campaign create/launch/kill/schedule, licence issue/revoke/redeem, tenant create/approve/delete/status, signup). Cross-tenant reads are logged only as a Nest `Logger` line by `auditSystemEntry`, which is not persisted and not visible in the audit UI. The claimed read-audit does not exist.

#### H6. No CI, and the one workflow is not in version control

`git ls-files .github/` returns nothing and `git status` reports `?? .github/` — the sole workflow, `.github/workflows/keep-alive.yml`, is untracked, so it never runs. It pings a hardcoded `https://vlumeaware.onrender.com/health` every 10 minutes and runs **no tests and no build**. Both packages define `test`, `typecheck`, `lint` and `build` scripts, and nothing invokes any of them. Every "fails the build" guarantee in the README — including the tenant-guard coverage spec — is currently unenforced.

#### H7. Broken lint tooling

`api/package.json` defines `"lint": "eslint \"{src,test}/**/*.ts\""` but **eslint is not in `devDependencies`** and no eslint binary is installed. `npm run lint` cannot run. (Both projects *do* typecheck cleanly — I verified `tsc --noEmit` passes in `api` and `web` — and the web console builds successfully.)

### MEDIUM

| # | Finding |
|---|---|
| M1 | **Account-lockout denial of service.** Five failed logins lock any account for 15 minutes, and there is no CAPTCHA, no exponential backoff and no per-account throttle independent of IP. Combined with H4 this locks out the superadmin. |
| M2 | **User enumeration by timing.** `login()` returns immediately when the email is unknown but runs bcrypt when it is known. |
| M3 | **Tokens are not revocable.** Logout only clears `localStorage`; there is no `jti` denylist, no server-side session record, and `JwtStrategy.validate` never re-checks that the user or tenant is still active. A suspended tenant's existing tokens keep working on non-consent routes until expiry (8 h default). |
| M4 | **`TenantScopeInterceptor` has zero test coverage.** All 170 tests call services directly; `supertest` is a devDependency that is never imported and there is no HTTP-level test anywhere. Isolation is proven at the Prisma-extension layer only. A regression that read the tenant from the URL would leave every test green. |
| M5 | **Two provably vacuous assertions.** `test/signup-trial.spec.ts:143` asserts `expect(pending.every((t) => true)).toBe(true)`. `test/tenant-isolation.spec.ts:239` queries the hardcoded literal `uniqueTrackingToken: 'beta'` while fixtures generate `beta-<ts>-token-<ts>` — no row can ever match, so the assertion passes even with the guard removed. |
| M6 | **The isolation suite exercises only 10 of the 20 allowlisted models.** `CredentialSubmission, Quiz, QuizQuestion, QuizAttempt, Certificate, PhishReport, VerifiedDomain, LicenseToken, SendingDomain, CustomLandingPage` are never touched. |
| M7 | **The coverage guard has a hole.** It keys on the literal `@map("tenant_id")` annotation; a model declaring a bare `tenantId String` (or a column added by raw SQL) is invisible to it, so the guard would pass while leaving that model unscoped. Parity holds today, but the check is weaker than its comment. |
| M8 | **The real `ReportsService` is mocked out of its only test.** `test/digest-cadence.spec.ts:28` substitutes `{ trend: async () => [] }`, so rates, trend, CSV export and the AI narrative are never exercised. |
| M9 | **`npx jest` cannot run the suite.** `npx` strips `NODE_OPTIONS`, so the suites that import `@nestjs/common` fail with a misleading "Must use import to load ES Module" error. Only `npm test` works. This is a sharp edge for anyone who doesn't read `require-node.mjs`. |
| M10 | **RichEditor can save one scenario's body into another.** `components/rich-editor.tsx:18-23` re-syncs on mode change only; switching scenarios without unmounting leaves the previous HTML in the `contentEditable`, and the next save persists it — silently, into an email body. |
| M11 | **Exports silently download API error bodies.** `components/report.tsx:157-170` and `app/client/certificates/page.tsx:47-56` never check `res.ok`, so a 401/500 JSON body is saved as `campaign-*.csv` or opened as a PDF. The certificate path also leaks its object URL and opens without `noopener`. `app/client/risk/page.tsx` does it correctly — the pattern was just not shared. |
| M12 | **Silent failures.** `SenderTitle.save` (`client/sending-domains/page.tsx:101`), the learner quiz submit and `markComplete` (`learn/[token]/page.tsx:86-125`, `t/[token]/quiz.tsx:41`) have `try/finally` with no `catch`, so a network error leaves the user with a spinner that stops and no message. |
| M13 | **`NEXT_PUBLIC_API_URL` is duplicated 13 times with a `localhost:3001` fallback**, including a redundant build-time injection in `web/next.config.js:4-6`. A deploy that forgets the variable does not fail — it silently ships a console pointed at localhost. |
| M14 | **API container runs as root, with no healthcheck, shipping devDependencies.** `api/Dockerfile` has no `USER`, no `HEALTHCHECK`, and `npm ci` without `--omit=dev`, so jest/typescript/`@nestjs/cli` land in the production image. |
| M15 | **`prisma migrate deploy` runs at container start with no advisory lock** (`Dockerfile:39`). The single-instance assumption exists only as a comment and is enforced nowhere; a race or a failed migration becomes a crash-loop. |
| M16 | **12 environment variables are read but undocumented**, including the production Redis path (`REDIS_URL`, `REDIS_PASSWORD`, `REDIS_TLS`) and Resend (`RESEND_API_KEY`, `RESEND_REGION`). Nothing validates them at boot — only `DATABASE_URL` and `JWT_SECRET` are checked. |
| M17 | **The AI provider defaults to DeepSeek, and this is documented nowhere.** `ai.module.ts` prefers `DEEPSEEK_API_KEY` over Anthropic. The provider's own comment notes that scenario prompts carry the client's industry and free-text context, and report prompts carry the client name and campaign results — a data-residency question for a platform selling NDPA compliance. README and PRD both say Claude only. |
| M18 | **A third-party CDN script is loaded into the superadmin console** (`app/super-admin/security/page.tsx:23`, cdnjs `qrcode.min.js`) — supply-chain exposure in the highest-privilege origin. It is also blocked by that console's own CSP, so the QR code never renders and users fall back to the manual key. |
| M19 | **Console navigation is mouse-only.** `components/guard.tsx:101-131` opens menus on `group-hover` with an `invisible` panel and a trigger `<button>` that has no click handler, no `aria-expanded`. Keyboard users cannot reach Scenarios, Templates, Content, Quizzes, Routing, Employees, Domains, Risk or Certificates. |
| M20 | **Landing-page beaconing and overlays.** The landing sanitizer is genuinely solid on schemes, but `sanitizeCss` misses CSS escapes (`@\69 mport url(...)` survives), so a client-authored page can still load remote CSS-adjacent resources and `<img src="https://…">` beacons (CSP allows `img-src https:`), leaking the viewer's IP/UA — including a Vlumetech superadmin opening a landing preview. `position:fixed;inset:0` overlays also survive. |
| M21 | **A superadmin can set a client admin's password** (`web/app/super-admin/[tenantId]/page.tsx:751-790`), i.e. staff can authenticate as a client. Defensible operationally, but it should be an explicit, audited decision. |
| M22 | **Five destructive deletes have no confirmation** (`client/scenarios:307`, `employees:337`, `content:358`, `quizzes:285`, `sending-domains:340`), while three other pages do confirm — inconsistent. |

### LOW / cosmetic

- **Documentation drift is severe** (see §4) — the README, PRD and marketing site describe a product that differs from the code in at least a dozen material ways.
- `docs/test-plan.html` is a ~34-case manual browser checklist with no reference to jest or any spec file; its step 0 asks the tester to rotate an "exposed database password".
- `web/app/terms/page.tsx:9-11` self-declares **"DRAFT: … NOT been through legal review"** while the marketing site advertises NDPA/GDPR readiness.
- `localhost:3001` and `https://*.supabase.co` (unused by `web/`) remain in config and CSP.
- Index-as-key in reorderable lists (`quizzes`, `learn`, `quiz-library`, `report`), `readSession()` called during render, `useSearchParams()` without a Suspense boundary, modals without `role="dialog"` or focus traps, `Notice` without `aria-live`, missing `<h1>` on 6 of 7 marketing pages, nav and footer JS-injected with no `<noscript>` (and `.reveal{opacity:0}` leaves content invisible without JS).
- `.gitignore` covers `.env` and `.env.local` but not `.env.*`.
- `web/.next` was rebuilt by this review, and `postgres-test` was left running; both are gitignored/state-only.

---

## 4. Documentation, marketing and reality

The gap between what is claimed and what exists is the second-biggest theme in this review after the XSS chain.

### Claims that are false

| Claim | Where | Reality |
|---|---|---|
| "Every scenario is reviewed and approved before it can reach a real inbox"; "Mandatory approval before any send" | `website/features.html:28,32`, `how-it-works.html:49`, `pricing.html:96`, `README.md:21,112`, `docs/prd.html:280,311` | Removed on 2026-09-22 (commit `9e609b1`). `Scenario.approvedAt` is dead; preflight checks only that ≥1 scenario is attached. `docs/prd.html:443-444` documents two endpoints that do not exist. |
| "Ten topics. Each a video, a quiz and a real phishing simulation" on every tier | `website/content-pack.html:27,58`, `index.html:119` | Seeded video URLs are `*.vlumetech.example` placeholders; the PRD itself says scripts await production files. |
| "Built to satisfy GDPR, NDPA and equivalent regimes" | `website/index.html:110`, `about.html:26` | The agreement is a self-declared DRAFT; legal review is listed as still open in the README. |
| Pricing "from about $19/mo" | `website/pricing.html:7` meta description | No $19 price exists anywhere. Minimums are $25 (emerging) or $69 (standard). |
| "Billing in local currency … including Naira" | `website/pricing.html:111` | Two USD bands only; no NGN amount exists in the code. |
| Tier entitlements: "1/3/unlimited verified domains", "2 campaigns/month" | `website/pricing.html:29-83` | **Zero enforcement.** No billing integration, no domain or campaign limit in the API; `licenseTier` is a free-text string. Only seat limits are enforced. |
| "Cross-tenant staff reads are recorded" | `README.md:109` | Not persisted; see H5. |
| "setTimeout… `runAsSystem` … used in five places" | `README.md:281` | There are well over a hundred call sites. |
| "Deliberately not built: … no self-serve signup" | `README.md:388` | Contradicts `README.md:168-188`; the signup flow and trial guards genuinely exist. |
| "96 tests", "34 assertions", "nine models carry tenant_id", "10 models + audit log", "23 tables · 11 migrations" | README/PRD | Actual: **170 tests**, 37 static assertions (52 runtime), **21** models with `tenant_id`, **26** models, **28** migrations. |

### Claims that understate the product

- **Mandatory staff/client MFA is shipped** (`totp.ts`, migration `20260918120000_staff_mfa`, two security consoles) but the marketing site calls it "roadmap" and the README mentions MFA zero times.
- **DeepSeek is a second, default-preferred AI provider**, and **Resend is a second mailer** — neither appears in the README.
- The public site never mentions the **7-day / 20-seat free trial** that exists, and has no link to `/signup`.

### Operational gaps a buyer or auditor would notice

- The demo form is a **`mailto:` redirect with no backend, no form service and no persistence** — for most browser-Gmail visitors the lead is silently lost, and the collected personal data (name, company, email, phone) sits in a URL with no consent checkbox or privacy notice, `novalidate` defeating the email check.
- **No privacy policy, security page, DPA, terms on the marketing site, status page, subprocessor list, retention statement or company registration details.** Enterprise copy advertises "SLA & support terms" and "On-prem / data-residency options" that do not exist.
- **`website/` is referenced by nothing** — no deploy config, no CI, no README entry. The only deployment artifact is `web/vercel.json` for the console.

---

## 5. What I verified by running things

| Check | Result |
|---|---|
| `npm test` (api, Node 25, migrated `postgres-test`) | **20 suites / 170 tests passed** (6.7 s). With the DB down: 14 suites / 134 tests fail — so the DB-backed suites are not vacuous. Note `npx jest` alone fails for an unrelated ESM reason. |
| `tsc --noEmit` in `api` and `web` | Both clean. |
| `npm run build` in `web` | Succeeds; 42 routes. Route table confirms `/portal` is `○ (Static)` — the evidence for H2. |
| `sanitizeHtml` / `sanitizeLandingHtml` executed against payloads | Scenario sanitizer bypassed by hex/named/control-char entities; landing sanitizer correctly rejects all of them. Evidence for C1. |
| `api/.env` tracked by git? | **No** — untracked and ignored. Only `.example` files are in git. No secret leak, though the local file holds a non-placeholder `JWT_SECRET` and a credential-bearing `DATABASE_URL`. |
| `.github/` tracked by git? | **No** (`?? .github/`) — the workflow has never run. |
| `npm audit` (api, web) | 0 vulnerabilities in both. |
| `trust proxy` set? | No. Evidence for H4. |

---

## 6. Recommended order of work

**Before any client data goes in**
1. Fix `sanitize-html.ts` (port the decoder from `sanitize-landing-html.ts`), sanitize at render, and add the hex/named-entity cases to `sanitize-html.spec.ts`. — C1
2. Stop rendering unsanitized drafts and AI output in the console. — C2
3. Enforce MFA server-side with a guard, or remove the "mandatory" claim. — H1
4. Fix the `/portal` CSP match so employee sign-in works in production. — H2
5. Add the missing gateway-secret check to `POST /intake/phish-report`, and throttle `/portal/request-link`. — H3
6. Set `trust proxy` and move the rate-limit counter to Redis. — H4

**Before scaling past one instance**

7. Add a real CI workflow (typecheck + build + `npm test` with a Postgres service) and commit it. — H6
8. Guard `prisma migrate deploy` with an advisory lock; add a Dockerfile `USER` and `HEALTHCHECK`; drop devDependencies from the runtime stage. — M14, M15
9. Add HTTP-level tests, starting with `TenantScopeInterceptor` and the tracking endpoints; delete the two vacuous assertions. — M4, M5

**Correctness and polish**

10. Fix `RichEditor` re-sync, the two broken export paths, and the silent-failure handlers. — M10-M12
11. Make the console keyboard-navigable. — M19
12. Reconcile the docs: delete the approval-gate claims from the site/README/PRD, correct the test and model counts, document MFA/DeepSeek/Resend, and either enforce or withdraw the tier entitlements. — §4
13. Publish the marketing site from the repo, or remove it; and give the demo form a real endpoint.

---

## 7. Overall assessment

This is a **thoughtfully engineered product with a serious, narrow security defect and a serious, broad honesty problem.**

The engineering quality is well above typical for a codebase this size: tenant isolation is enforced at the right layer and defended by a real drift test, credential capture was deliberately reduced to metadata and locked down with a static guard, the kill switch is correct, secrets are handled properly, the test suite genuinely runs against a real database and passes, and the code is unusually well commented with the reasoning behind each decision. Almost every "hard" decision here was made correctly.

The critical flaw is a ten-line function that was fixed in one file and not its sibling, with an accompanying test that covers the wrong encoding — and it lands on a console that keeps `'unsafe-inline'` and stores its bearer token in `localStorage`, in a product whose entire value proposition is security awareness. It is a small, well-understood fix.

The broader problem is that the README, the PRD and the marketing site describe a more finished and more compliant product than the one in the repository: an approval gate that was deleted, tests that were counted when there were fewer, tiers and prices with no enforcement, compliance claims ahead of legal review, and a test plan that tests something else. For a company selling NDPA compliance to Nigerian enterprises, that drift is a business risk, not a documentation chore.

---

## 8. Batch 1 — what changed

Applied 2026-09-25. Scope chosen with the product owner: fix what is exploitable, grandfather existing MFA accounts. **235 tests pass (was 170), both packages typecheck, the web console builds, and the CSP fix was verified against a running production server.**

| Finding | Fix | Verified by |
|---|---|---|
| **C1** sanitizer bypass | New shared decoder `api/src/common/security/entities.ts` (`decodeEntities`, `normalizeForSchemeCheck`); both sanitizers now use it. `sanitize-html.ts`'s `safeUrl` became a positive allow-list instead of a decimal-only denylist. | 22 obfuscated payloads blocked in **both** sanitizers, 8 legitimate links preserved; new `test/sanitizer-parity.spec.ts` pins the two together; extended `test/sanitize-html.spec.ts` |
| **C2** unsanitized draft render | `POST /tenants/:tenantId/scenarios/preview` (sanitize-only); the composer previews the server's output. Scenario and template bodies are now sanitized **on read** as well as on write, which also neutralises rows already stored under the old sanitizer. | typecheck; preview path renders sanitized HTML |
| **H1** MFA not enforced | `MfaEnforcedGuard` registered as a global guard; `mfaRequired` column on `users` (default true) and `tenant_users` (default false, copied from the tenant's own policy at creation); migration backfills existing staff to false; seeder exempts the demo accounts; `@AllowUnenrolledMfa()` on `mfa/setup`, `mfa/activate` and the security page's read | new `test/mfa-enforcement.spec.ts` (7 cases incl. grandfathering and both client states) |
| **H1a** enrolment unreachable for client users | The sign-in redirect sent **every** role to the staff page; it is now role-aware, and `/client/security` honours `?enroll=1` so the flow starts automatically | typecheck; build |
| **H2** `/portal` dead in production | `isPublic` now matches `/portal/` with the trailing slash, so the statically prerendered request form gets the no-nonce policy | live `next start`: `/portal` → `script-src 'self' 'unsafe-inline'` with 0 nonced scripts (consistent → runs); `/portal/:token` and `/t/:token` → nonce + `strict-dynamic` with 11 nonced scripts (unchanged) |
| **H3** open intake endpoint, unthrottled mail | `IntakeSecretGuard` (`X-Vlumeaware-Intake-Secret`, constant-time, rejects ambiguous duplicate headers, fails closed in production); `@Throttle` on `/portal/request-link`; `INTAKE_SHARED_SECRET` documented | new `test/intake-secret.spec.ts` (5 cases) — which caught the duplicate-header acceptance during development |
| **H6** no CI | `.github/workflows/ci.yml`: Postgres service, Node 24, migrate, typecheck, test, build for both packages. Comment records the `npm test` vs `npx jest` trap. | workflow added; **`.github/` is still untracked — it must be `git add`ed or CI will not run** |
| **H7** dead lint scripts | Removed `lint` from both packages: `api` had no eslint installed, and `next lint` no longer exists in Next 16. | `next --help` command list has no `lint`; no eslint binary present |

### Deliberately left for later batches

- **H4** (`trust proxy` + rate-limit counter in Redis) and **M15** (unguarded `prisma migrate deploy`) — both need the real hosting topology: the exact proxy hop count, and whether more than one instance can ever run. Getting `trust proxy` wrong in the other direction is worse than the bug.
- **M14** Dockerfile hardening, **M17** DeepSeek disclosure, **M18** the cdnjs script in the superadmin console.
- **Batch 3** — HTTP-level tests (`supertest` is installed but unused), starting with `TenantScopeInterceptor`; the two vacuous assertions; the ten unexercised tenant-scoped models.
- **Batch 4** — the documentation and marketing drift in §4. Note the README's "96 tests" is now further out of date: it is 235.
- **Not yet done:** re-seeding a development database. `npm run seed` will set `mfaRequired: false` on the demo staff account; the migration handles existing rows.

---

## 9. Batch 2 — what changed

Applied 2026-09-25, after the product owner confirmed the topology: **one Render instance today, may scale later**, behind a single proxy.

| Finding | Fix | Verified by |
|---|---|---|
| **H4a** `trust proxy` unset | `app.set('trust proxy', <hops>)` in `main.ts`, defaulting to 1, overridable with `TRUST_PROXY`, validating that it is an integer 0-10 so the dangerous `true` cannot be set by accident. The boot line now reports the value. | live container: the login limiter counts per caller instead of globally |
| **H4b** per-process counters | New `RateLimitStore` abstraction: `RedisRateLimitStore` (a Lua `INCR`+`PEXPIRE` so a crash cannot leave a key with no expiry) and `InMemoryRateLimitStore`. Redis is chosen as soon as Redis is configured, with `RATE_LIMIT_STORE` to override. One shared `redisConnection()` now serves both the queue and the limiter. | 13 new tests, including two store instances counting as two processes; **and a second container returning 429 immediately** on an exhausted window |
| **M15** migrate-on-boot | Migrations removed from the entrypoint, with a dedicated `migrate` build stage (the runtime stage has production dependencies only, so it no longer carries the Prisma CLI) and a deploy-step command documented in the Dockerfile and README. Made safe by a boot-time schema check (`schema-guard.ts`) in **both** the API and the worker that counts migrations in the image against those applied and refuses to start if the database is behind, or if a migration was started but never finished. | 6 new tests; live container refused to boot against an unmigrated database with exit code 1; the `migrate` stage applied all 29 migrations to a **fresh** database, producing the expected 27 tables |
| **M14** container hardening | Runs as `USER node`, `HEALTHCHECK` against `/health`, and `npm ci --omit=dev` in the runtime stage with only the generated Prisma client copied across. `prisma` CLI is no longer needed at runtime now that migrations are a deploy step. | image built and booted; `id` reports uid 1000; `/health` returned 200 |
| — | **Pre-existing bug found while verifying:** `worker.ts` set `bufferLogs: true` with `createApplicationContext`, and nothing ever flushed it, so the worker had **never logged a single line** — not "worker started", not a failed send, not one `runAsSystem` audit entry. Fixed; the worker now logs. | worker now prints "Schema up to date (29/29)" and "Vlumeaware send worker started" |
| **M16** (partial) | `TRUST_PROXY`, `RATE_LIMIT_STORE`, `SKIP_SCHEMA_CHECK`, `REDIS_URL`, `REDIS_PASSWORD`, `REDIS_TLS` documented in `.env.example`. | — |

Suite is now **254 tests across 25 suites**, all passing, with `REQUIRE_REDIS_TESTS=1` in CI so the Redis path cannot silently skip.

### Still deliberately deferred

- **Batch 3** — HTTP-level tests (`supertest` is installed but unused), coverage for `TenantScopeInterceptor`, the two vacuous assertions, the ten tenant-scoped models the isolation suite never touches.
- **Batch 4** — the documentation and marketing drift in §4. The README's test count is now 96 → 254.
- **Remaining medium items** — the `cdnjs` script in the superadmin console (M18), the DeepSeek disclosure (M17), the web-console correctness bugs (M10-M13), keyboard access (M19).
- **Not verified from this machine:** the Render pre-deploy command must actually be set to `npx prisma migrate deploy` before this deploys, or the schema check will (correctly) refuse to start the service. That is a dashboard change, not a code change.

---

## 10. B3 — migrations restored to boot, and a bug that found

Applied 2026-09-25, at the product owner's direction, because the Render tier in use has no pre-deploy hook.

### The premise of the Batch 2 change was wrong

Moving migrations out of the entrypoint was justified by a race between concurrent container starts — a claim inherited from a Dockerfile comment and repeated in this review. **Prisma Migrate already serialises them.** The strings are in the shipped engine binary:

```
SELECT pg_advisory_lock(72707369)
Timed out trying to acquire a postgres advisory lock (SELECT pg_advisory_lock(72707369)) …
PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK
```

So concurrent `migrate deploy` processes queue on a Postgres advisory lock rather than colliding. Boot-time migration is therefore safe at any instance count, and on a tier with no pre-deploy command it is the only option that does not depend on somebody remembering a manual step. Migrations now run at boot again (`src/common/prisma/migrate-on-boot.ts`), in **both** the API and the worker, with the schema check immediately after as the second opinion. `MIGRATE_ON_BOOT=0` leaves them to a deploy step for anyone who prefers that.

### The bug this exposed

`USER node` (Batch 2) plus a migration file written with a restrictive umask produced:

```
Error: P3015
Could not find the migration file at migration.sql.
```

The file was mode `600`; `COPY` preserves context modes; the container runs as `node`, so the file was `EACCES`. Every other migration in the repository is `644`, so this would have appeared on the **first deploy containing a new migration** — and only locally, since git records `644` regardless of the working-tree mode. It was invisible before Batch 2 because migrations ran as root.

Two fixes: `COPY --from=build --chown=node:node /app/prisma ./prisma`, so the tree is owned by the user that reads it and host file modes cannot decide whether a deploy can migrate; and the affected files normalised to `644`.

### Verified

| Check | Result |
|---|---|
| Boot against a **fresh, empty** database, no manual step | applied all **29 migrations** in one boot; 27 tables, `mfa_required` present, 29 finished / 0 unfinished; `/health` 200 |
| `--chown` fix is doing the work, not the `chmod` | migration forced back to mode `600`, image rebuilt: file owned `node:node`, app user reads it successfully |
| `MIGRATE_ON_BOOT=0` against an unmigrated database | refuses to start (exit 1) with an actionable message — it does not silently serve a stale schema |
| Full suite | **261 tests, 26 suites**, all passing |
| Typecheck | clean |

### Note for whoever deploys this

Nothing needs configuring on Render. Migrations run at boot; a migration that cannot be applied fails the deploy and leaves the previous version serving.
