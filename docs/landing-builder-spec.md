# Spec — Drag-and-drop landing-page builder

_Vlumeaware · Vlumetech LTD · draft for review_

## 1. Problem & goal

Clients need to build simulated-login landing pages **visually** — drag blocks,
set colours, drop in a logo — without writing HTML. Today there are three ways
to get a landing page, and the gap is the last one:

| Today | For whom |
|---|---|
| 4 built-in React templates (brand / M365 / Google / Okta) | everyone, but fixed |
| 10 ready-made HTML designs ("Ready-made pages") | everyone, but fixed |
| **Raw-HTML textarea** ("Custom page — build now") | **only people who can write HTML** |

Goal: replace the raw-HTML textarea with a **visual editor** whose output flows
through the *same* storage + sanitise + render path we already have, so nothing
about the live capture page changes.

## 2. Hard constraints (from the codebase — do not design around these)

These are enforced server-side and are the trust boundary. The builder is a
convenience on top; it must produce output that survives them.

- **Sanitiser** (`api/src/common/security/sanitize-landing-html.ts`) runs on every
  saved/previewed page. It allows: layout/text tags, tables, `img`, **`<style>`
  + `class`/`id`/inline `style`** (CSS is stripped of `@import`/`expression()`).
  It **drops** `script`, `iframe`, `svg`, `link`, `meta`, event handlers, and —
  importantly — **`form`/`input`/`button`** are *not* in the allow-list, so a
  builder can never add a real, working form field.
- **The only functional form** is the platform's metadata-only sign-in form,
  injected at the `{{LOGIN_FORM}}` marker by the live page
  (`web/app/t/[token]/login/page.tsx`). The builder must let the user **place
  that marker** and nothing that looks like a credential field otherwise.
- **CSP** on the live login page blocks external scripts, fonts and images.
  `<svg>` is sanitised away. ⟹ **no external assets.** Logos/images must be
  either CSS/text or uploaded to our **own** storage and served from an origin
  the landing-page CSP allows (see §7 — this needs a header change).
- **Render path**: a page is stored as `CustomLandingPage.html` (per tenant),
  sanitised, and rendered on the live page around the `{{LOGIN_FORM}}` marker.
  The builder changes *authoring*, not rendering.

## 3. Options

| Option | What | Fit | Effort |
|---|---|---|---|
| **A. GrapesJS** (recommended) | Open-source (BSD) web-page builder; outputs HTML + `<style>`/classes; fully customisable block set | Best — it's a *web page* builder, output matches the sanitiser's `<style>`+class model, and we can restrict the palette to allowed blocks | Medium |
| **B. Unlayer** (`react-email-editor`) | Hosted drag-and-drop; outputs table-based *email* HTML + a design JSON | Works (sanitiser allows tables) but it's email-shaped, proprietary, and its output needs mapping/trimming to the allow-list | Low to embed, medium to constrain |
| **C. Bespoke block editor** | Build our own blocks (heading/text/image/button/divider/columns/**sign-in form**) + colour pickers | Perfect fit, zero dependency, but | High (weeks) |

**Recommendation: A (GrapesJS)** with a **constrained block set** and a custom
"Sign-in form" block that emits the `{{LOGIN_FORM}}` marker. It gives a true
web-page WYSIWYG, output that the sanitiser passes through intact, and control to
hide anything we can't allow. Pick **B (Unlayer)** only if time-to-ship beats
fit; avoid **C** unless we outgrow GrapesJS.

## 4. Architecture (how it plugs in)

```
Builder (GrapesJS, constrained)  ──export HTML+CSS──►  POST /landing-pages/preview  (sanitise)  ──►  iframe/modal preview
         │  (+ design JSON)
         └──save──►  POST/PATCH /landing-pages  { name, html, designJson }
                                      │
                             CustomLandingPage row  ──(unchanged)──►  live /t/[token]/login renders html @ {{LOGIN_FORM}}
```

- The editor runs **inside the authenticated console** (never a public route —
  see the earlier `/landing-preview` finding; a public page that renders
  brand-login chrome is a hosted-phishing surface).
- On **save**, export the editor's HTML (GrapesJS emits `<style>` + classes,
  which the sanitiser keeps) *and* its **design JSON** (so the page can be
  reopened for editing).
- The **"Sign-in form"** block renders a placeholder in the editor and exports
  the literal `{{LOGIN_FORM}}` string — the one spot the live page fills.
- **Preview** reuses the existing `/landing-pages/preview` endpoint, so the
  preview is the *sanitised* output — "what you see is what renders."

## 5. Data-model & API changes

- `custom_landing_pages`: add **`design_json JSONB NULL`** (the builder's design,
  for re-editing). One additive migration; existing pages keep `design_json = NULL`
  and open as raw HTML.
- API (`landing-pages.controller.ts`):
  - extend `create`/add `update` to accept `designJson`;
  - add **`GET /tenants/:id/landing-pages/:id`** returning `{ name, html, designJson }`
    (today `list` returns only `{id,name}`, so a saved page can't be reopened —
    this also unlocks the "preview a saved page" gap noted earlier);
  - keep `preview` (sanitise-only) as-is.
- No change to the send worker or the login render.

## 6. UI / UX

- New entry in the Landing-page selector: **"Build with editor"** → opens the
  builder full-screen (modal or `/client/landing-builder` route, authenticated).
- Blocks (Phase 1): heading, text, image (upload), button/link, divider,
  spacer, 1–2 column row, **sign-in form**. Global controls: page background,
  accent colour, font size. A **Templates** tab seeds the existing 10 designs as
  editable starting points.
- Save → name it → it appears under **"Your saved pages"** and is selectable in
  campaigns. Reopen to edit (loads `design_json`).

## 7. Security (the parts that matter)

- **Sanitiser stays the boundary.** The builder is untrusted; every save/preview
  is sanitised server-side. Never render un-sanitised builder output on the live
  page.
- **Images:** route uploads through the existing upload path → Supabase Storage
  (`api/src/providers/storage`), with the current size/type limits
  (`upload-limits.ts`). ⚠️ **CSP change required:** the landing page's
  `img-src` must include the storage origin, or uploaded logos won't load. Scope
  this tightly to that origin — do **not** open `img-src` to `*`.
- **No credential capture by the client:** `form`/`input` are already stripped,
  so a built page cannot collect anything; only `{{LOGIN_FORM}}` (metadata-only)
  works. The "Sign-in form" block must emit *only* the marker.
- **Authenticated-only builder + token-gated render** (unchanged): a design is
  only ever shown to a real recipient via a campaign tracking token, never as a
  standalone URL.
- **WYSIWYG-vs-sanitised parity test (required):** a test that round-trips a
  representative editor export through the sanitiser and asserts the visible
  result is unchanged — so "what you build" always equals "what renders." If the
  sanitiser would strip something a block produces, that block is disallowed.

## 8. Phasing & effort (indicative)

- **Phase 1 — MVP (~1–2 weeks):** embed GrapesJS constrained to the allowed
  blocks + the sign-in-form block; `design_json` + `GET :id`; save/edit/preview
  via the existing path; image upload to storage + the CSP `img-src` change;
  the parity test.
- **Phase 2 (~1 week):** seed the 10 ready-made designs as editable templates,
  logo-upload UX, colour/theme presets, mobile-width preview.
- **Phase 3 (larger):** the shared **100-page** library (DB-backed, cross-tenant),
  built on the same HTML/design-JSON format — this is where "10 → 100" lives.

## 9. Risks / open questions

- GrapesJS vs Unlayer final call (recommend GrapesJS; confirm with a half-day spike).
- CSP `img-src` for uploaded images — confirm the exact header location and that
  scoping to the storage origin is acceptable.
- Editor output that the sanitiser trims (the parity test is the guard; some
  GrapesJS defaults, e.g. flexbox utilities or data-attributes, may need pruning).
- Licensing: GrapesJS is BSD-3 (fine); Unlayer has a free tier + paid plans.
- Bundle size: GrapesJS is sizeable — load it **only** inside the builder route
  (dynamic import), never in the main console bundle.

## 10. Acceptance criteria (Phase 1)

1. A non-technical admin can build a landing page by dragging blocks, setting a
   background/accent colour, uploading a logo, and placing the sign-in form — no
   HTML.
2. Preview shows the **sanitised** result; it matches what the live page renders.
3. Saving creates a reusable page under "Your saved pages"; reopening restores
   the exact design for editing.
4. A built page, used in a real campaign, renders correctly on `/t/[token]/login`
   with the metadata-only form in the right place.
5. No external assets load; uploaded images come only from our storage origin.
6. The parity test passes in CI.

---

_Sequencing: build after the current 371-recipient campaign — it touches the
landing area and adds a migration + a CSP change, neither of which should land
in the pre-campaign window. The 10 ready-made pages already cover the immediate
need._
