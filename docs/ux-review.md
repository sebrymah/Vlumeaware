# UX review — what to fix, in what order

Scope: the Next.js app in `web/` — the client console, the Vlumetech staff console, the
public pages (login, signup, docs, terms, verify, invite) and the employee-facing flows
(simulation landing, teachable moment, training, quiz, certificate). Reviewed against
`main` at `9c2f408`.

Method: read the code for every route and shared component, then counted the patterns
that make a difference at scale — loading states, empty states, error surfaces,
accessibility attributes, responsive breakpoints, focus handling, and text contrast.
Numbers below are counts from the source, not impressions.

The point of this document is to make the next two weeks obvious, not to describe a
redesign. The application is structurally sound: one design language, one component
kit, almost every page already has an `h1`, destructive actions are confirmed, and the
tenant model is enforced in the UI as well as the API. The gaps are in the seams.

## The three systemic gaps

1. **Nothing exists between a page request and its data.** There is no `loading.tsx`,
   `error.tsx` or `not-found.tsx` anywhere in `app/`. Every route renders an empty shell,
   fetches in an effect, then paints. A slow connection shows a blank frame; a thrown
   render shows Next's default error page with no branding and no way back; a mistyped
   URL shows the same. This is the single highest-value fix because it affects every
   page at once.
2. **State handling is per-page and therefore uneven.** 15 places use `SkeletonRows`;
   16 pages render nothing while loading. Some lists explain an empty result
   ("Nothing delivered yet."), others show an empty table body. Users cannot tell
   "still loading" from "you have no data" from "the request failed" unless they read
   the network tab.
3. **The shared kit stops at the console door.** Of six public routes, one imports
   `components/ui`. The invite page is fully hand-rolled (3 raw inputs/buttons, 0 kit
   components). The result is that the surfaces a prospect and an employee see do not
   look like the product they were sold.

## Findings

Severity is about user impact. Effort is rough: S ≤ half a day, M ≤ 3 days, L ≥ a week.

### A. States and feedback

| # | Finding | Evidence | Sev | Effort |
|---|---|---|---|---|
| A1 | No `error.tsx` / `not-found.tsx` / `global-error.tsx`: failures and bad URLs show an unbranded Next page | all three files absent | High | S |
| A2 | 12 pages rendered an empty row ("No certificates issued yet") before their request settled, so a slow connection looked like an empty account | **fixed everywhere it could happen** — 18 pages now have a loading state, verified by scanning for empty states without one | High | M |
| A3 | `Guard` paints a full-screen "Loading…" text on every navigation while it reads localStorage | `components/guard.tsx` session gate | Medium | S |
| A4 | Feedback rendered only where the form sat, so a save at the bottom of a long page was announced off-screen | fixed: `ToastProvider` plus wiring on campaigns, employees, groups and security | Medium | M |
| A5 | `EmptyState` exists and six pages use it, but **20 empty rows bypassed it** for a bare `colSpan` line with ad-hoc padding | 20 `colSpan` sites across 13 files | Medium | S |
| A6 | No global focus style and no `prefers-reduced-motion`; 17 elements carry their own `focus-visible` classes | `globals.css` has print only | Medium | S |

### B. Accessibility

| # | Finding | Evidence | Sev | Effort |
|---|---|---|---|---|
| B1 | 28 hints are 11–12px in `text-slate-400` on white — about 2.8:1, below the 4.5:1 minimum | 63 `text-slate-400`, 28 at small sizes | High | S |
| B2 | Placeholder-only inputs had no accessible name (search boxes, quiz fields) and the preview's mock sign-in was exposed to assistive tech as a set of unusable controls | 10 such inputs found; all labelled or hidden | High | M |
| B3 | Tables have no `scope="col"` and scroll horizontally with no affordance | `components/ui.tsx` Table | Medium | S |
| B4 | The landing-preview modal has no `role="dialog"`, `aria-modal`, Escape handler or focus return | `app/client/page.tsx` preview modal | Medium | S |
| B5 | Mobile navigation is a flat 13-link horizontal scroller: no grouping, no cue that it scrolls (it does have `aria-current` and a label, which is good) | `components/guard.tsx` MobileNav | Medium | M |
| B6 | Charts are width-encoded with the number in a table column (good), but the bar divs are unlabelled decoration | `components/report.tsx` | Low | S |

### C. Consistency and design system

| # | Finding | Evidence | Sev | Effort |
|---|---|---|---|---|
| C1 | Public surfaces drift from the kit. `/login` and `/signup` do import it (the login through `PortalLogin`), but their primary buttons are hand-rolled, `/portal` was entirely hand-rolled, and `/docs`, `/terms` and `/verify` style themselves | 2 of 6 direct, 1 indirect | Medium | M |
| C2 | The invite page is entirely hand-rolled — *fixed* | `app/invite/[token]/page.tsx` | Medium | S |
| C6 | `Button` had a single size: 12px text on a ~28px target, used for primary actions everywhere including login forms | `components/ui.tsx` | Medium | S |
| C3 | Two type scales coexist: admin 11–13px, docs 15px, marketing site its own. Employee-facing pages use 20px headings and 14px body | `app/docs` vs `app/client/*` vs `app/t/*` | Medium | M |
| C4 | One blocking native dialog remains: group rename uses `window.prompt` | `app/client/groups/page.tsx:87` | Low | S |
| C5 | Terminology drifts: "console users", "users", "team", "people" all name different things in different places | `app/client/security`, `guard.tsx`, `employees` | Low | S |

### D. Responsive

| # | Finding | Evidence | Sev | Effort |
|---|---|---|---|---|
| D1 | Layout is mostly single-column at every width: 30 `sm:` utilities, 2 `md:`, 2 `lg:` across the whole app | counts above | Medium | L |
| D2 | Wide tables rely on horizontal scroll; on a phone the first column is the only one visible | 7 `overflow-x` wrappers | Medium | M |
| D3 | Employee-facing flows are opened on phones by definition but are not tuned for them (few breakpoints, small type) | `app/t/[token]`, `app/learn/[token]` | High | M |

### E. The employee experience — the highest-stakes surface

*(Pass started: the direction-independent half is done — see "Delivered" below. What
remains is the product decision at the end of this section.)*

The simulation landing, teachable moment, training module, quiz and certificate are the
pages every target sees. They carry the product's reputation and they are read on a
phone, in a hurry, possibly mid-meeting. Today they use 20px headings, 14px body, and
almost no responsive tuning (4–10 responsive/type matches per page, 0–1 aria
attributes). This deserves its own pass, not a share of the console's dense admin
scale: larger type, more space, a clear single call to action, and a consistent
"you were caught" moment that ties the simulated page back to the brand.

### F. Onboarding and information architecture

- Good: the readiness checklist, the trial banner, and the setup guide all exist.
- The nav item "Setup guide" now leaves the console for the public `/docs` page, so a
  signed-in admin lands on a page offering "Start free trial". Either keep an in-console
  copy or render `/docs` without the marketing chrome when a session exists.
- A brand-new tenant sees a wall of empty tables. The checklist is the answer, but it
  sits on one page; consider surfacing the next unfinished step on the empty states
  themselves ("Add your first employee" rather than an empty table).

### G. Perceived performance

Every route fetches after mount with no cache, so navigating back re-runs the same
request and re-shows the same skeleton. A thin data layer (per-key cache + revalidate on
focus, or React Query/SWR) would remove most repeat spinners without touching the API.
This is the largest perceived-speed win available; treat it as a separate decision, not
a styling change.

## Roadmap

**Now — the seams (about 2 days, all low risk)**

1. `app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx` — branded, one clear
   action each. (A route-level `loading.tsx` is deliberately not part of this: the pages
   fetch in an effect after mount, so a route-level loader would paint and vanish. The
   real fix is skeleton coverage, item 10.)
2. ~~Apply `EmptyState` to the pages rendering an empty table body~~ — done: a table-aware
   `EmptyRow` wraps it, 20 sites converted, and the filtered-search case gained a
   "Clear search" action.
3. Contrast pass: move the 28 small `text-slate-400` hints to `text-slate-500`.
4. Global `:focus-visible` ring and `prefers-reduced-motion` in `globals.css`.
5. ~~Table `scope="col"`; invite page onto the kit~~ — done.
6. ~~`role="dialog"`/Escape/focus return on the preview modal~~ — done.

**Next — the experience (about a week)**

7. Employee-facing redesign pass (type scale, spacing, mobile, one CTA per page).
8. Public pages onto the shared kit, so login, docs, terms, verify and invite look like
   one product.
9. Toasts for action feedback; keep inline `Notice` for validation.
10. Skeleton coverage on the remaining 16 pages.
11. Mobile nav grouping (sections), and a scroll affordance on the table wrappers.

**Later — structural**

12. A data layer to cut repeat fetches (cache + focus revalidation).
13. Responsive layouts for the two or three screens that are genuinely used on a phone.
14. Optional dark mode; only worth it once the type/contrast tokens are centralised.

## How to know it worked

Nothing here is currently measured, which is why the gaps persisted. Minimum viable
instrumentation: page-load-to-interactive per route, the share of sessions that reach
"first campaign launched", and the rate of failed requests surfaced as `Notice kind="error"`.
The audit trail already records admin actions, so task-level analysis is available
without new backend work.

## Delivered in this change

The three items below were implemented alongside this document, because they touch no
business logic and are visible on every page:

- **Branded failure surfaces.** `app/not-found.tsx`, `app/error.tsx` and
  `app/global-error.tsx` replace Next's unbranded defaults. Each names what happened,
  says that nothing was changed, and offers one action; the error page shows the digest
  as a reference a support request can quote.
- **One focus ring, everywhere.** `globals.css` now sets a single `:focus-visible`
  outline, which covers the raw inputs and links on public pages that had none of their
  own — keyboard use is a required path through this console.
- **Reduced motion honoured.** The progress animation and transitions stop for anyone
  who has asked for less motion.
- **Contrast fixed on small text.** 28 hints at 11–12px were `text-slate-400` on white
  (about 2.8:1). They are now `text-slate-500` (about 4.8:1), across 20 files.

Second tranche, same branch:

- **One empty state, applied.** `EmptyRow` joins `EmptyState` in the kit; 20 bare
  `colSpan` rows became it, and the eight most consequential ones gained a sentence of
  guidance ("Add employees and a scenario first…"). The filtered roster search now offers
  a **Clear search** action instead of a dead end.
- **`scope="col"`** on every table header, so a screen reader announces the column.
- **The invite page** now uses `Card`/`Field`/`Button`/`Notice` — it was the only page in
  the product built from raw elements.
- **The landing preview is a real dialog**: `role="dialog"`, `aria-modal`, labelled,
  Escape closes it, focus moves in and returns to the opener.

Fifth tranche — honesty about loading, and accessible names:

- **Three list pages stop claiming to be empty while they load.** `certificates`,
  `reported` and `risk` render `SkeletonRows` until their data arrives; previously the
  empty row ("No certificates issued yet") was the first thing painted, so a slow
  request looked like an empty account.
- **Three placeholder-only inputs gained an accessible name** — the quiz's
  prompt/option/explanation fields. The staff pickers and roster search already had one:
  my first count said otherwise because the scan's regex stopped at the `>` inside
  `onChange={(e) => …}` and never saw the attribute after it. Worth recording as a
  reminder that a naive scan of JSX over-reports.
- **The two mock sign-in forms** (campaign preview and landing design) are
  `aria-hidden`: they are pictures of a form, and announcing them as unusable controls
  is worse than silence.

Still bare: six client pages (`domains`, `license`, `reporting-setup`, `routing`,
`sending-domains`, `templates`) and six staff pages. The pattern is now established and
mechanical; it is the obvious next increment.

Fourth tranche — the public surfaces:

- **`Button` gained a size.** It was 12px on a ~28px target, used for every primary
  action including the sign-in form. `size="md"` (14px, ~40px) is now used by login,
  the portal request page, the invite page and employee actions; the console keeps its
  dense default, so no admin screen shifted.
- **`/portal` moved onto the kit** (`Card`/`Field`/`Button`/`Notice`, logo header), and
  the login's two hand-rolled submit buttons became `Button`, so the first screen a
  user meets matches the rest of the product.
- `/verify` already used a branded card and 16px body; it needed nothing.

Third tranche — the employee-facing pass, without changing what those pages say:

- **Type and space.** The simulation landing, teachable moment, training and
  certificate pages move from a 14px/20px admin scale to 16px body with a
  `text-2xl sm:text-3xl` title — they are read once, on a phone, by someone who did not
  choose to open them.
- **A real landmark.** The employee shell was a `<div>`; it is now `<main>`, with room
  to breathe at both widths and a single legible footer line instead of two 11px ones.
- **The quiz is usable with a thumb.** Options had `px-2 py-1` at 14px — roughly 28px
  tall. They are now a 44px target with a visible focus ring, the selected answer takes
  the tenant's accent colour, and the result is announced (`role="status"`,
  `aria-live`) rather than only coloured.
- **The report button no longer lies.** It reported "thank you — noted" in a `finally`
  block, so a dropped connection told the employee their report had been counted when
  nothing was recorded. It now distinguishes success from failure and offers Try again.

The "Now" tranche is complete, and the direction-independent half of "Next". What
remains: the public pages onto the kit, toasts, skeleton coverage, and the product
decision below.

**A duplication worth fixing properly.** The training page carries its own copy of the
quiz markup rather than sharing `app/t/[token]/quiz.tsx`, so the pass had to be applied
twice and the two will drift. Extracting one learner-facing quiz component is a small
refactor with a real payoff; it is on the "Later" list rather than done here, because it
touches scoring-adjacent UI.

### The decision the employee pass needs

The simulation landing currently imitates a plausible corporate sign-in, and the
post-click page explains the exercise in Vlumeware's own voice. That split is the right
default — a simulation that announces itself is not a simulation — but it is a product
decision, not a styling one, and it changes the whole visual pass. Options: keep it
(realistic lure, explicit debrief), brand the *frame* while keeping the lure neutral, or
theme the debrief in the client's own colours (the accent is already available).
