# Spec — Reporting: manual attribution, and the credit policy

_Vlumeaware · Vlumetech LTD · draft for approval — nothing here is built yet_

Extends [`phishing-reporting-spec.md`](phishing-reporting-spec.md), which specifies
the automated feeders (forwarding address, connected mailbox). This document covers
the half that spec does not: **what happens when a report never touches the
platform**, and **when a report is allowed to count as a catch**.

## 1. Problem

An employee who receives a suspicious email has no dependable way to report it, and
a client admin has no way to record a report that happened off-channel ("Thabo
walked over and told me"). The result is that the one metric the product sells —
*how many people catch the phish* — undercounts reality and cannot be evidenced.

## 2. What exists today

| Path | Today | Reference |
|---|---|---|
| Forward to `report+<token>@report.<domain>` | Code complete, **dormant in production**: `/intake/postmark` returns `503` | `intake/postmark.controller.ts`, `intake.service.ts` |
| "Report this as phishing" button | Only on the teachable-moment page **after a click**; token-only and unauthenticated | `tracking.controller.ts` `POST /track/report/:token` |
| Tell the admin or IT | **Not recorded anywhere** | — |

Two facts drive the design:

1. **A forwarded report is recorded but not credited.** `IntakeService` credits
   `send.reportedAt` only when the mail matched a simulation **and**
   `senderAuthenticated !== false`. That flag comes from `POSTMARK_AUTHSERV_ID`,
   which is unset — so forwarding produces a `phish_report` row and a flat metric.
2. **The credit rule for the button is "before a click".** Reporting after clicking
   is deliberately not a catch (`tracking.service.ts`, `reportedAt: null,
   clickedAt: null`). Anything new must agree with that or the numbers stop meaning
   one thing.

## 3. Outcome 1 — employees can report (outside this spec's build)

The feeders themselves are specified in `phishing-reporting-spec.md` §3. What is
decided here is the **credit policy**, because it decides whether that build is
worth anything.

| Option | Rule | Consequence |
|---|---|---|
| **A. Strict** | Credit only when the sender authenticated (`Authentication-Results` with our authserv-id) | Forwarding never credits in practice → manual attribution becomes the only path that counts |
| **B. Recipient match** | Credit when reporter == real recipient, the mail carries a valid simulation token, and it wasn't clicked | Reports count; an attacker able to mail the address could inflate a rate. No data is exposed — the harm is metric integrity |
| **C. Hybrid (recommended)** | Credit on the B rule, **and** store whether authentication passed on the report, so the data can be re-scored if the policy tightens | Numbers move, the evidence is not destroyed, and the decision stays reversible |

Recommendation: **C**. It is the only option that both makes the metric work and
keeps the stricter signal available for an auditor who asks how confident we are.

## 4. Outcome 2 — the client admin records manual reports

### 4.1 Data model

`phish_reports` gains three columns. No new table.

```prisma
enum ReportSource { forwarded button manual }   // how the report reached us
model PhishReport {
  // … existing fields …
  source     ReportSource @default(forwarded)   // existing rows were all forwarded
  recordedBy String?      @map("recorded_by")    // staff or client_user id, manual only
  note       String?                              // "forwarded from shared mailbox"
}
```

`matchedSendId` already distinguishes a simulation catch from a real-threat report,
so no new linkage is needed.

### 4.2 Credit rules

| Situation | Credit the send? | Record the report? |
|---|---|---|
| Manual, campaign chosen, employee has a delivered send, not clicked, not already reported | **Yes** | Yes |
| Manual, campaign chosen, but they already clicked | No | Yes — a late report is still information |
| Manual, campaign chosen, already reported by another path | No (idempotent) | No — surface "already reported" |
| Manual, no campaign (a real phish they spotted) | No (nothing to credit) | Yes, with a note |
| Forwarded, per policy C | Yes, if recipient matches and not clicked | Yes |

### 4.3 API

```
POST   /tenants/:tenantId/reports/manual     { employeeId, campaignId?, note? }
DELETE /tenants/:tenantId/reports/:reportId  (undo a mistaken mark)
GET    /tenants/:tenantId/phish-reports      (existing; now returns source + recordedBy)
```

- `client_admin` only; `client_viewer` is read-only (same pattern as the rest of
  the console).
- The write is one transaction: create the report, then `updateMany` the send with
  `reportedAt: null, clickedAt: null` — the same guard the channel uses, so a race
  cannot double-credit.
- Errors: `404` employee/campaign not in this tenant, `409` already reported,
  `400` no delivered send for that employee in that campaign.
- `DELETE` clears `reportedAt` **only if this report set it**; the row is kept and
  marked void rather than deleted, so the audit trail survives.

### 4.4 UI

**Campaign report page** (`/client/campaigns/:id`): a "Record a report" action
opening a searchable employee picker (multi-select), a note field, and a list of
manual marks — "Nomvula M. · recorded by you · 12 Oct" with **Undo**.

**Phish reports page**: a Source column (Forwarded / Button / Manual), who recorded
it, and the campaign it credited. A "Record a report" button as well, for a report
that arrives with no campaign in mind.

**Dashboard / campaign report**: report rate keeps its current definition
(`send.reportedAt` is not null). A source breakdown appears beneath it:
"12 reported — 9 forwarded, 3 recorded by an admin", so nobody has to guess how the
number was produced.

### 4.5 Audit

`report.manual.create` and `report.manual.void`, with the actor, the employee, the
campaign and the note. An admin can move a number; the log must say so.

## 5. Edge cases

| Case | Behaviour |
|---|---|
| The employee was never sent that campaign | `400` — there is no send to attach to |
| They clicked a day earlier | Report recorded, **not** credited (consistent with the button rule) |
| Two admins mark the same person | Second gets `409`; the first credit stands |
| Shared mailbox, reporter unknown | Manual path names the person, which is the point |
| Employee deactivated after the campaign | Still recordable — the send exists |
| Campaign closed months ago | Recordable; the report page shows the date it was recorded |
| Marked in error | Undo, audited, credit cleared |

## 6. Security & privacy

- **Inflation.** Only `client_admin` can mark, every mark is audited, and the source
  breakdown is visible — an inflated number is attributable, which is the realistic
  control here.
- **The existing button route is token-only and unauthenticated.** Whoever holds a
  tracking token can credit a report. Not fixed in this spec, but it should be
  tightened to require that the token has not been clicked and to rate-limit per
  token; noted as a follow-up.
- **PII.** Manual records store an employee id and an admin id, no message content.

## 7. Phasing

| Phase | Scope | Effort |
|---|---|---|
| **1** | Manual attribution: schema, endpoints, picker, undo, source column, breakdown | ~2 days |
| **2** | Credit policy C for the channel; set `POSTMARK_INBOUND_SECRET` + `REPORT_INBOUND_DOMAIN`; publish the address on the teachable page and setup guide | ~1 day + configuration |
| **3** | Source breakdown in exported CSV; campaign-less report triage view | ~1 day |

Phase 1 needs no vendor account and closes today's gap, so it goes first.

## 8. Decisions needed

1. **Credit policy:** A, B or C? *(Recommend C — credit on recipient match, keep the authentication evidence.)*
2. **Campaign-less reports:** allow them as real-threat records with a note? *(Recommend yes.)*
3. **Clicked-then-reported:** record but do not credit? *(Recommend yes — matches the existing button rule.)*
4. **Who may mark:** client_admin only, viewers read? *(Recommend yes.)*
5. **Undo window:** any time, audited, or limited to 24 hours? *(Recommend any time; audit carries the history.)*
6. **Source breakdown visible to clients,** or staff-only? *(Recommend visible; it is their metric.)*
7. **Retire the post-click button,** or keep it as a third source? *(Recommend keep and tag it — it is the only path that works without a vendor.)*

## 9. Acceptance criteria

- An admin can mark a named employee as having reported, on a chosen campaign, and
  the campaign's report rate rises by one on reload.
- The same mark cannot be applied twice, and a second attempt says so.
- Undo removes the credit and leaves an audit entry naming who undid it.
- A mark on an employee who already clicked records the report without crediting it.
- A campaign-less report is recorded, appears in Phish reports, and credits nothing.
- A forwarded report credits the send under policy C, and the report shows
  Forwarded as its source.
- `client_viewer` sees the columns and buttons disabled; the API rejects a viewer's
  `POST` with `403`.
