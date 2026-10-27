# Spec — Create a group from campaign results

_Vlumeaware · Vlumetech LTD · draft for approval — nothing here is built yet_

After a simulation, an admin wants to turn "the people who clicked / submitted
credentials" into a named group, review and trim the membership, then use that
group to target follow-up training. The Groups feature already exists
(`EmployeeGroup` / `EmployeeGroupMember`, campaign targeting at a group); this
spec adds the **create-from-results** path on top of it.

## 1. Definitions

A campaign can run several scenarios, and `Send` is unique per
`(campaignId, employeeId, scenarioId)` — so one employee can have several sends in
one campaign. "Affected" is therefore **per employee, across all of their sends in
that campaign**:

| Criteria | Definition | Field |
|---|---|---|
| **Clicked** | any send has `clickedAt` | `sends.clickedAt != null` |
| **Submitted credentials** | any send has `credentialsSubmitted` | `sends.credentialsSubmitted = true` |
| **Caught it** | any send has `reportedAt` | `sends.reportedAt != null` |
| **Opened** | any send has `openedAt` | `sends.openedAt != null` |

Submitters are a subset of clickers (you cannot submit without landing on the
form). The UI must say so, otherwise "clicked (24)" and "submitted (18)" reads as
two disjoint groups when it is not.

## 2. The flow

On the campaign report page, one action: **"Create a group from results"**.

1. **Choose the criteria** — one of the four above (presets), or "Clicked **or**
   submitted" (any interaction).
2. **Preview** — the matched employees, each with a checkbox and their name,
   email and department.
3. **Edit the membership** — untick anyone who should not be in it (a known-good
   click, a test account). The result is a review step, not a blind bulk-import.
4. **Name it** — a suggested default is pre-filled (`Clicked — <campaign> 12 Oct`),
   editable, unique per tenant as today.
5. **Confirm** — creates the group with exactly the ticked members.

Repeat for another criteria to make a second group — there is no one-group
limit; "multi-groups per test" falls out of the fact that each is an independent
group.

## 3. Snapshot semantics

The group is a **snapshot of results as they stood when it was created**. A late
click, a resend, or a manual report added afterwards does not change the group.
This matches how group targeting already works (a campaign drafts its recipients
at build time). The confirmation screen states it in one line, so nobody expects
the group to live-update.

## 4. Data & API

No new model for membership — `EmployeeGroup` and `EmployeeGroupMember` already
cover it. Two small changes:

1. **Atomic create with members.** `groups.create` today makes an empty group and
   `setMembers` is a separate, non-transactional call (delete-then-insert). Add:
   ```
   POST /tenants/:tenantId/groups   { name, employeeIds }
   ```
   creating the group and its members in one transaction, and reusing the existing
   tenant-scoped narrowing of `employeeIds` (a foreign id can never be linked).
2. **Results-by-employee read** for the preview:
   ```
   GET /tenants/:tenantId/campaigns/:campaignId/impact
   → [{ employeeId, name, email, department, clicked, submitted, reported, opened }]
   ```
   Aggregating `sends` per employee with the criteria flags, tenant-scoped. This is
   the only genuinely new query; it reuses the report's `deliveredWhere` filter so
   "affected" means *delivered* sends, not drafts.

**Optional provenance** (recommend now, it is cheap): add nullable
`sourceCampaignId` and `sourceCriteria` to `EmployeeGroup`, so the group page can
show "from the October campaign, clicked". It turns "why does this group exist"
from a memory test into a label, and it is what makes the group defensible to a
client later. Without it the feature still works; with it the group is self-
documenting.

## 5. UI

- **Campaign report page** (`/client/campaigns/:id`): the "Create a group" action
  and modal. Admin-only; a viewer sees the button disabled.
- **Groups page**: no change to editing, but a Source column if provenance is kept.
- **Natural next step**: after creation, a one-line affordance — "Target a
  follow-up campaign at this group" — linking to the campaign builder with the
  group preselected, because creating the group is only useful if it is then used.

## 6. Edge cases

| Case | Behaviour |
|---|---|
| Campaign had multiple scenarios | One row per employee, flags OR-ed across their sends |
| Employee already in another group | Fine — membership is many-to-many |
| Empty results (no clicks) | "No one matched this criteria" and no group |
| An employee is later deleted | They cascade out of the group (existing FK), which is correct |
| The campaign is killed/draft | Only delivered sends count; drafts match nothing |
| Name collides | `409` "A group with that name already exists", as today |

## 7. Permissions & audit

`client_admin` creates and edits; `client_viewer` reads. Each create is audited
(`group.create_from_results`, with the campaign and criteria) so the provenance of
a group the platform then uses to target training is on the record.

## 8. Recommendations (the "also recommend")

1. **Ship the four presets plus "any interaction"**, not a free-form field builder
   — that covers the ask (clickers, submitters) and the obvious extra (caught it),
   without inventing a query language.
2. **Lead with "Submitted credentials" as the default preset** — it is the
   highest-risk group and the one clients act on first.
3. **Keep the provenance fields** — they cost one column each and answer the only
   question that comes back later ("why are these 18 people in a group?").
4. **Make "then target a follow-up" the primary next action**, so the group does
   not dead-end in the Groups page.
5. **Snapshot, not live** — do not rebuild the group as new results arrive; if a
   client wants the latest set, they create a new group and the old one stays for
   the record.

## 9. Decisions needed

1. **Criteria set** — the four presets + "any interaction", or a subset? *(Recommend all five.)*
2. **Provenance fields** on the group, or skip? *(Recommend add — cheap, self-documenting.)*
3. **Snapshot semantics** confirmed? *(Recommend yes.)*
4. **Default preset** — submitted credentials? *(Recommend yes.)*

## 10. Acceptance criteria

- From a campaign report, an admin creates a group "Clicked" and it contains every
  employee with a delivered, clicked send, and no one else.
- The preview lets the admin untick any person before confirming; the group
  reflects the ticks, not the full match.
- A second group "Submitted" for the same campaign is a subset, and creating it
  succeeds — multiple groups per campaign.
- A campaign with two scenarios credits an employee once even if they clicked both.
- The group page shows the source campaign and criteria, and the name the admin
  chose.
- `client_viewer` cannot create; the API returns `403`.
