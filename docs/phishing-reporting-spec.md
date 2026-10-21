# Spec — Phishing reporting (multi-provider, client-configurable)

_Vlumeaware · Vlumetech LTD · draft for review_

## 1. Problem & goal

Staff need a way to **report a suspicious email** — both our own simulations
(which should earn a "caught it" credit) and real phishing (which security
should triage). Today the only path is "email or message infosec manually",
which doesn't feed the product at all.

The platform already has the **sink** for reports — what's missing is the
**feeders** that get a reported email into it, and a way for each client to
**choose and configure** how their staff report.

Goal: a **per-tenant, admin-configurable reporting channel** that works across
mail providers (Zoho, Google, Microsoft, and others) and flows every report
through the single intake pipeline that already exists. This is a Vlumetech
product capability for **all** clients, not a BabbanGona one-off.

## 2. Hard constraints (from the codebase — do not design around these)

These already exist and define the trust boundary. Everything new sits in front
of them.

- **The sink exists and is provider-neutral.** `POST /intake/phish-report`
  (`api/src/modules/intake/intake.controller.ts`) accepts a parsed message:
  `{ reporterEmail, subject?, sender?, rawBody? }`. It does not care how the
  report was captured. **Feeders normalise to this shape; nothing downstream
  changes.**
- **Auth is a shared secret.** The endpoint is `@Public()` behind
  `IntakeSecretGuard` (`X-Vlumeaware-Intake-Secret` == `INTAKE_SHARED_SECRET`)
  and `@Throttle({ limit: 60, windowMs: 60_000 })`. In prod the secret is
  currently **unset**, which makes the endpoint unauthenticated — **must be set
  before any feeder goes live** (§8).
- **Tenant + reporter resolution already works.** `IntakeService.ingest`
  (`api/src/modules/intake/intake.service.ts`) matches `reporterEmail` → an
  `employee` row (system-scoped `findFirst` by email), and the employee's
  `tenantId` becomes the report's tenant. Unknown reporters are logged and
  **not** recorded.
- **Simulation vs real is already detected.** The service scans `rawBody` for
  our tracking token (`/track/(click|open)/<token>`); if it resolves to a `send`
  in the **same tenant**, the report is flagged `matchedSimulation` and credits
  the send's `reportedAt` (a forwarded simulation still counts as a correct
  catch). Otherwise it's a real-threat `phishReport` row for triage.
- **Storage exists.** `phish_reports` holds
  `{ tenantId, employeeId, reporterEmail, subject, sender, matchedSimulation,
  matchedSendId, createdAt }`, listed by `GET /tenants/:tenantId/phish-reports`
  (shown under Reporting → Phish reports).

⟹ The work is: **(a) a tenant config for the chosen channel, (b) one or more
feeders that call the existing endpoint, (c) a settings UI, (d) set the secret.**

## 3. Architecture — one sink, pluggable feeders

```
 Staff reports ──► [ Feeder ] ──► POST /intake/phish-report ──► IntakeService
                     ▲                 (shared secret)            │
   Layer 1: forwarding (universal)                               ├─ simulation? credit send.reportedAt
   Layer 2: connected mailbox (Zoho/Google/MS, per-tenant)       └─ else: phish_reports row  ──► Reporting UI
   Layer 3: one-click button (per provider, later)
```

The three layers are **feeders**, not forks of the pipeline. A tenant may run
more than one at once (e.g. forwarding for phones + a button on web).

### Layer 1 — Forwarding (universal; works with every provider today)

Staff **forward** a suspicious email to a Vlumeaware intake address; an inbound
service parses it and calls the endpoint. Forwarding is universal, so this one
layer covers **Zoho, Google, Microsoft, Yahoo, anything** with zero
per-provider code. It is how most awareness platforms ingest reports underneath.

- **Address scheme (decision §11).** Default: a Vlumeaware-hosted address, e.g.
  `report@report.vlumesec.com`, tenant resolved from the **reporter's email
  domain / employee lookup** (already how `ingest` finds the tenant). For
  robustness against domain collisions and for a stable "publish this address"
  value, also support a **per-tenant alias**: `report+<tenantToken>@report.vlumesec.com`
  (the token maps straight to a tenant, no domain guesswork).
- **Inbound pipeline (decision §11).** Receive the forwarded mail and POST to
  the endpoint. Options, provider-agnostic: SES Inbound → Lambda, or a hosted
  inbound-parse (Postmark / Mailgun / SendGrid Inbound Parse), or Cloudflare
  Email Workers. The receiver extracts: reporter = the **forwarder's** From
  (that's the employee), plus the original subject/sender/body carried in the
  forwarded message, and POSTs with the secret.
- **Data-governance note.** Forwarding sends a **copy of the reported mail to
  Vlumeaware**. For clients who won't allow that, Layer 2 keeps everything in
  their own mailbox. This is exactly why the channel must be **per-client
  configurable**.

### Layer 2 — Connected mailbox (per provider, optional)

For clients who want reports to **stay in their own tenant**, a connector polls
a designated folder in the client's mailbox via the provider's API and feeds the
same endpoint. One connector per provider, behind a single interface:

```ts
interface ReportConnector {
  provider: 'zoho' | 'google' | 'microsoft';
  // Pull messages added since the saved cursor, normalise, and hand back.
  fetchNewReports(cfg: TenantReportChannel): Promise<NormalisedReport[]>;
}
interface NormalisedReport {
  reporterEmail: string;   // the staffer who forwarded/moved it
  subject?: string;
  sender?: string;         // the original (spoofed) sender
  rawBody?: string;        // to scan for our token
  providerMessageId: string; // for idempotency / cursor
}
```

- **Providers:** Zoho → Zoho Mail API; Google → Gmail API; Microsoft → Graph API.
  Adding a provider = one new class implementing `ReportConnector`; the pipeline,
  storage and UI don't change.
- **Auth:** OAuth per tenant (admin connects on the settings page). Store tokens
  encrypted; refresh on expiry.
- **Polling:** a scheduled job (reuse the existing BullMQ repeatable tick that
  drives the scheduler) iterates tenants with a connected channel, calls the
  connector, POSTs each new report, and advances a per-tenant **cursor**
  (`providerMessageId` / history id) so nothing is processed twice.
- **Folder:** admin designates a folder (e.g. "Phish Reports") so the connector
  never reads the team's normal mail; a provider mail-rule routes forwards into
  it.

### Layer 3 — One-click button (per provider, later polish)

A "Report Phishing" button inside the mail client. Per provider: Zoho **Sigma**
extension, Google **Workspace add-on**, Microsoft **Outlook add-in** (the
"Report Message" pattern). Each one just **forwards to Layer 1** or **calls the
API** — it is UX sugar, not a new pipeline. Mostly **web-mail only**; mobile
apps have limited custom-button support, so forwarding (Layer 1) remains the
mobile fallback.

## 4. Data model

One new per-tenant config row; reports still land in `phish_reports`.

```
model TenantReportChannel {   // one per tenant (or per provider if we allow several)
  id               String   @id
  tenantId         String   @unique      // tenant-scoped like every other model
  method           ReportMethod          // forwarding | connected
  provider         ReportProvider?       // zoho | google | microsoft (connected only)
  forwardingToken  String?  @unique       // per-tenant alias token (Layer 1)
  folder           String?                // mailbox folder to poll (Layer 2)
  oauth            Json?                   // encrypted tokens (Layer 2)
  cursor           String?                // last processed providerMessageId / historyId
  status           ChannelStatus          // unconfigured | active | error
  lastReceivedAt   DateTime?
  createdAt        DateTime @default(now())
}
enum ReportMethod   { forwarding connected }
enum ReportProvider { zoho google microsoft }
enum ChannelStatus  { unconfigured active error }
```

Must be added to `TENANT_SCOPED_MODELS` (the tenant-guard registry) with the
usual build-time coverage test. `oauth` holds secrets → encrypt at rest, never
return it from the API.

## 5. Client-admin UX — Settings → "Phishing reporting"

A new page under the admin's Settings area:

- **Choose a method:**
  - **Forwarding address** (default, instant) — shows the address to publish to
    staff + a copy button + a short "tell your staff to forward here" blurb.
  - **Connect a mailbox** — pick provider (Zoho / Google / Microsoft) → OAuth
    "Connect" → choose the folder to watch.
- **Status**: active / error, and "last report received" timestamp.
- **Test**: a "send a test report" affordance that round-trips one message so the
  admin can confirm it lands under Reporting → Phish reports.

Admin-only writes; viewers read. Same role pattern as the rest of the console.

## 6. Security & privacy

- **Set `INTAKE_SHARED_SECRET` in prod** and have every feeder send it. Until
  then the endpoint is open — blocker for go-live.
- **Reporter spoofing.** `reporterEmail` decides whose record a report attaches
  to. A forwarded header can be forged. Mitigations: Layer 1 receiver should
  trust the **envelope/auth** sender, not just a body header; and a report only
  attaches to an employee that exists in a tenant, so the blast radius is "a
  report credited to the wrong colleague", never cross-tenant. Note in the
  connected path the mailbox owner is the tenant, so the risk is lower.
- **Rate-limit** stays on the endpoint; add per-tenant caps in the poller.
- **PII / content.** Forwarded mail may contain sensitive content. Layer 1 copies
  it to Vlumeaware; Layer 2 keeps it in-client. Store only what Reporting needs
  (subject/sender/flags) — avoid persisting full `rawBody` beyond the token scan
  unless a client opts in. Document retention.
- **Same-email-in-two-tenants** edge: `ingest` uses `findFirst` by email. For the
  per-tenant alias token (Layer 1) and connected mailboxes (owned by one tenant)
  this is unambiguous; for bare-domain forwarding, resolve by the recipient alias
  first, then fall back to domain.

## 7. Phasing

| Phase | Scope | Unblocks |
|---|---|---|
| **1** | Forwarding channel + settings page + set the secret + inbound receiver | **Every client, including BabbanGona, with no OAuth** — staff just forward |
| **2** | `ReportConnector` framework + **Zoho** connector + OAuth + poller | BabbanGona's "keep it in infosec@" option; proves the abstraction |
| **3** | **Google** + **Microsoft** connectors | Workspace / M365 clients |
| **4** | One-click buttons (Zoho Sigma, Google add-on, Outlook add-in) | Web-mail UX polish |

## 8. Phase 1 — concrete build scope

What we build first (valid regardless of how Phases 2–4 land):

1. **Migration + model** `TenantReportChannel` (method defaults to `forwarding`,
   a generated `forwardingToken` per tenant); add to the tenant-guard registry +
   coverage test.
2. **Settings API + page** — `GET/PUT /tenants/:id/report-channel`; the
   "Phishing reporting" page showing the forwarding address + copy + status.
3. **Inbound receiver** — the chosen pipeline (§11) that parses a forwarded mail
   and `POST`s to `/intake/phish-report` with the secret and the resolved tenant
   (via the alias token).
4. **Set `INTAKE_SHARED_SECRET`** in prod; receiver sends it.
5. **Staff comms string** surfaced in the UI (e.g. "To report a suspicious
   email, forward it to `report+<token>@report.vlumesec.com`").

No change to the intake service, storage, simulation-credit logic, or the
Reporting UI — those already work.

## 9. Open decisions

1. **Forwarding domain** — Vlumeaware-hosted (`report.vlumesec.com`, recommended,
   universal) vs each client brings their own. _Leaning Vlumeaware-hosted so it
   works out of the box; connected-mailbox covers clients who refuse external
   forwarding._
2. **Inbound pipeline** — SES Inbound+Lambda vs hosted inbound-parse (Postmark/
   Mailgun/SendGrid) vs Cloudflare Email Workers. _Pick on ops preference + cost;
   the receiver contract is identical._
3. **One channel per tenant, or several** (e.g. forwarding **and** a connected
   mailbox at once). _Model allows per-tenant; multiple would need a child table._
4. **Retention** of forwarded content / `rawBody`.
5. **Tenant resolution** for bare-domain forwarding when an email exists in two
   tenants (alias-token-first resolves most of it).

## 10. Why this shape

- The **sink, tenant resolution, simulation-credit, storage and Reporting UI
  already exist and are provider-neutral** — so the cheapest correct design is
  "feeders in front of the existing endpoint", not a new subsystem.
- **Forwarding first** gives every client value immediately with zero
  per-provider work, and unblocks BabbanGona without waiting on any OAuth.
- The **connector interface** makes each new provider an additive class, so
  "accommodate other clients in future" is a one-file change, not a redesign.
