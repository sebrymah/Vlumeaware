# Runbook — ISO/IEC 27001:2022 awareness content pack

**Purpose:** load the 30-quiz / 150-question ISO 27001 awareness pack into Vlumeaware, and deploy the code that makes it reachable.
**Audience:** a human operator or an automated agent executing step by step.
**Repo:** `git@github.com:sebrymah/Vlumeaware.git` · default branch `origin/main`

---

## 0. Current status — read this first

**Not shipped to production.** The content is loaded into the **local development database only**, and the code changes are **uncommitted** on a feature branch.

| Question | Answer |
|---|---|
| Is it on the live platform (Supabase / aware.vlumesec.com)? | **No** |
| Is it in the local dev database? | **Yes** — `localhost:5432/vlumeaware`, verified |
| Is the code committed? | **No** — uncommitted working-tree changes on `fix/guide-readability` |
| Is the deployed API serving it? | **No** — needs the deploy in Part 7 |
| Is the local API serving it? | **No** — the process on `:3001` is stale (see Part 2) |
| Is anything needed from the user? | Yes — Supabase `DATABASE_URL` (Part 3) and a deploy decision (Part 7) |

**Where it currently lives:** local Postgres container `vlumeaware-postgres`, database `vlumeaware`. Verified contents: 30 shared quizzes, 150 questions, 24 ISO lures (44 templates total), 13 training modules (10 from the ISO pack).

---

## 1. Artifacts and paths

All paths are relative to the repo root unless absolute. `<ROOT>` = `/Users/tobi.adeyemo/Desktop/vlumeaware`.

| Path | Status | Purpose |
|---|---|---|
| `docs/Vlumeaware-ISO27001-Phishing-Awareness-Pack.md` | new | The approved content pack (brochure, video script, 30 quizzes, 30 scenarios, 15 emails, runbook, Annex A crosswalk). Source of truth for content. |
| `api/scripts/build-iso27001-pack.mjs` | new | Generator: document → loadable data. Re-run after any document edit. |
| `api/prisma/content/iso27001-awareness-pack.ts` | new (generated) | The loadable pack. **Do not hand-edit.** |
| `api/prisma/seed.ts` | modified | Adds `seedIsoPack()` and `SEED_CONTENT_ONLY=1` mode. |
| `api/package.json` | modified | Adds the `seed:content` script. |
| `api/scripts/check-content-pack.mjs` | new | Read-only verifier. Safe against production. Use as a gate. |

Pre-existing and **not** modified by this work: `api/prisma/content/iso27001-2022.ts` (the original 10-topic pack, never imported).

---

## 2. Part 1 — Local: confirm the content is loaded

**Working directory:** `<ROOT>/api`

### 2.1 Ensure the database and Redis are running

```bash
cd <ROOT>
docker compose up -d postgres redis
docker ps --format '{{.Names}}\t{{.Status}}'
```

Expected: `vlumeaware-postgres` and `vlumeaware-redis` both `Up (healthy)`.

### 2.2 Regenerate the pack from the document (optional, safe)

```bash
cd <ROOT>
node api/scripts/build-iso27001-pack.mjs
```

Expected output (exact numbers):

```
wrote /Users/tobi.adeyemo/Desktop/vlumeaware/api/prisma/content/iso27001-awareness-pack.ts
  topics   10
  quizzes  30
  questions 150  (answer key {"A":37,"B":38,"C":37,"D":38})
  lures    24
  modules  10
```

The generator **fails loudly** if any lure lacks a `{{TRACKING_URL}}` link, or if any question does not have exactly 4 options. A non-zero exit here means the document is broken — do not proceed.

### 2.3 Load the content (content only — no demo data)

```bash
cd <ROOT>/api
npm run seed:content
```

Expected:

```
SEED_CONTENT_ONLY=1 — shared content only. No accounts, tenants or demo data will be created.
  iso pack      0 modules, 0 quizzes (0 questions), 0 lures
Content load complete. No accounts, tenants or demo data were created.
```

`0` on a second run is **correct** — loading is idempotent, keyed by title. `10 modules, 30 quizzes (150 questions), 24 lures` on a first run.

### 2.4 Verify with the read-only checker

```bash
cd <ROOT>/api
node --env-file=.env scripts/check-content-pack.mjs --strict
```

Expected (exit code **0**):

```
target database    localhost:5432/vlumeaware  (current_database: vlumeaware)
LIBRARY TOTALS
  shared quizzes              30   (ISO pack 30/30)
  phishing templates          44   (ISO pack 24/24)
  shared training modules     13   (ISO pack contributes 10)
ISO PACK INTEGRITY
  questions in pack         150 (expect 150)
  answer key                A=37  B=38  C=37  D=38
  quizzes not 5 questions   0
  questions not 4 options   0
  quizzes guessable by "B"  0
  lures with no tracking link 0
RESULT: ISO 27001:2022 content pack is COMPLETE and sound.
```

**Gate:** exit code must be `0`. `--strict` exits `1` if anything is missing.

---

## 3. Part 2 — Local: restart the API so the library is served

**Why:** the API process currently listening on `:3001` is an older build. It serves `/phishing-templates` but returns **404** for `/shared-quizzes` and `/shared-modules`. A fresh start from the same source serves all of them.

### 3.1 Find and stop the stale process

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
lsof -ti tcp:3001 | xargs kill
```

### 3.2 Start a fresh API

```bash
cd <ROOT>/api
npm run start:dev
```

Or, from a build:

```bash
cd <ROOT>/api
npm run build
node --env-file=.env dist/main.js
```

Leave it running. Wait for `Vlumeaware API on :3001`.

### 3.3 Verify over HTTP

```bash
cd <ROOT>
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"it@vlumetech.com.ng","password":"vlumeaware-dev-password"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')

curl -s http://localhost:3001/shared-quizzes -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("quizzes:",len(d))'
```

Expected: `quizzes: 30`

**Note on route shape:** quizzes live at `tenants/:tenantId/quizzes/...`, **not** `/quizzes/...`. Cloning a shared quiz is
`POST /tenants/<tenantId>/quizzes/from-shared/<sharedQuizId>` with body `{"campaignId":"<id>"}`.

---

## 4. Part 3 — Production: credentials

### 4.1 What is required

**One value:** the Supabase Postgres connection string.

```
postgresql://postgres:<DB_PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres
```

**It must be the direct connection (port `5432`) or the Session pooler.** Do **not** use the Transaction pooler on port **`6543`**. Reason: `api/prisma/schema.prisma` declares only `url = env("DATABASE_URL")` with no `directUrl`, and Prisma's migration engine holds a Postgres advisory lock, which a transaction pooler cannot hold across statements. Migrations will fail or hang on `6543`.

If only `6543` is available, run migrations with the direct URL separately, then load content through the pooler.

Also required to confirm the target: the **project ref**, so the operator can confirm this is production and not a staging or preview branch.

**Not required for this load:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` (only for uploading real video files, which do not exist yet), and Redis. The `postgres` role must have DDL rights **only** if 4.3 is needed.

### 4.2 Store it OUTSIDE the repo

> **Security warning.** `<ROOT>/.gitignore` ignores `.env` and `.env.local` as *exact filenames*. A file named `api/.env.production` is **NOT ignored** and a live database password would be one `git add .` from being committed. Either add `.env.*` to `.gitignore` first (Part 7.1) or keep the credentials outside the repository entirely, as below.

```bash
cat > /tmp/vlumeaware-prod.env <<'EOF'
DATABASE_URL='postgresql://postgres:<DB_PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres'
EOF
chmod 600 /tmp/vlumeaware-prod.env
```

**Quote the value with single quotes.** This preserves `@`, `#` and `$` characters in the password, and was verified to parse identically for both `node --env-file` and shell sourcing.

---

## 5. Part 4 — Production: pre-flight (read-only, no writes)

**Do not skip this.** It confirms you are pointed at the intended database before anything is written.

```bash
cd <ROOT>/api
node --env-file=/tmp/vlumeaware-prod.env scripts/check-content-pack.mjs
```

This issues **SELECT statements only**. Expected: the first line names the production host, and the counts show the current state.

```
target database    db.<PROJECT_REF>.supabase.co/postgres  (current_database: postgres)
LIBRARY TOTALS
  shared quizzes              N   (ISO pack 0/30)
  ...
RESULT: INCOMPLETE —
```

**Gate:** confirm the printed host is the intended production database. If it is not, **stop**. If the host is wrong, no writes have occurred — nothing to undo.

**Also record the "before" numbers** — they are needed for the change report in Part 6.

### 5.1 Check the schema is migrated

```bash
cd <ROOT>/api
set -a; . /tmp/vlumeaware-prod.env; set +a
npm run prisma:deploy
```

`prisma migrate deploy` is idempotent — with no pending migrations it reports "No pending migrations to apply". **Only run this if the schema is not already current**; if the production API is already deployed, `MIGRATE_ON_BOOT` (on by default) has already applied the schema.

---

## 6. Part 5 — Production: load the content

```bash
cd <ROOT>/api
set -a; . /tmp/vlumeaware-prod.env; set +a
npm run seed:content
```

Expected on a fresh production library:

```
SEED_CONTENT_ONLY=1 — shared content only. No accounts, tenants or demo data will be created.
  iso pack      10 modules, 30 quizzes (150 questions), 24 lures
Content load complete. No accounts, tenants or demo data were created.
```

**This mode creates no users, no tenants, no employees, no campaigns and no sends.** That is the whole point of it. It is safe to re-run: already-present items are skipped by title.

**Never run `npm run seed` against production.** The full seed creates a superadmin (`it@vlumetech.com.ng`) with a known password and MFA disabled, two demo tenants, five employees, a campaign and five fake sends. The content-only mode exists specifically to avoid this.

---

## 7. Part 6 — Production: verify

```bash
cd <ROOT>/api
node --env-file=/tmp/vlumeaware-prod.env scripts/check-content-pack.mjs --strict
```

**Gate:** exit code **must be `0`** and the result line must read:

```
RESULT: ISO 27001:2022 content pack is COMPLETE and sound.
```

Expected ISO-pack figures: `30/30` quizzes, `24/24` lures, `150` questions, `0` quizzes not 5 questions, `0` questions not 4 options, `0` passable by always answering "B", `0` lures without a tracking link.

Report the before/after counts from Part 4 and this step.

---

## 8. Part 7 — Deploy the code

The database can hold the content, but the deployed API will not expose it until this code ships. **Nothing is committed yet.**

### 8.1 Protect against committing secrets

```bash
cd <ROOT>
grep -q '^\.env\.' .gitignore || printf '.env.*\n!.env.example\n' >> .gitignore
git check-ignore -v api/.env.production || echo "still NOT ignored — investigate before committing"
```

### 8.2 Commit

Current branch is `fix/guide-readability`; the deploy branch is `main`. Decide whether to merge or branch.

```bash
cd <ROOT>
git add api/scripts/build-iso27001-pack.mjs \
        api/scripts/check-content-pack.mjs \
        api/prisma/content/iso27001-awareness-pack.ts \
        api/prisma/seed.ts \
        api/package.json \
        docs/Vlumeaware-ISO27001-Phishing-Awareness-Pack.md \
        .gitignore

git status --short          # confirm ONLY the intended files
git commit -m "ISO 27001:2022 awareness content pack: 30 quizzes, 24 lures, loader and verification"
```

**Check before committing that no `.env` file is staged.**

### 8.3 Ship it

```bash
git push origin fix/guide-readability
```

Then merge to `main` by your normal process (PR, or fast-forward merge) so the deploy triggers:

```bash
git checkout main && git pull && git merge --ff-only fix/guide-readability && git push origin main
```

**This step depends on how deployment is wired** (Render auto-deploy on `main`, or a manual trigger). Confirm before assuming it shipped.

### 8.4 Confirm the deployment

The API applies pending migrations at boot (`MIGRATE_ON_BOOT`, on by default). Watch the deploy log for a successful start, then:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.vlumesec.com/auth/me
```

Expected `401` (reachable; unauthenticated). `404` on `/shared-quizzes` means the old build is still serving.

Verify the live library:

```bash
TOKEN=$(curl -s -X POST https://api.vlumesec.com/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<a-real-superadmin>","password":"<password>"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')

curl -s https://api.vlumesec.com/shared-quizzes -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import sys,json;print("live quizzes:",len(json.load(sys.stdin)))'
```

Expected: `live quizzes: 30`

> The host `api.vlumesec.com` is taken from `docs/Vlumeaware-PRD.md`. **Confirm the real production host before relying on it.**

---

## 9. Rollback

The load is **additive**. Nothing existing is updated or deleted. To undo it:

```sql
-- Removes only ISO-pack content, identified by its source marker.
delete from shared_quizzes        where source = 'ISO/IEC 27001:2022 awareness pack';
delete from phishing_templates    where source = 'ISO/IEC 27001:2022 awareness pack';

-- Training modules carry no source column; match on the 10 generated titles.
-- (List them with: node api/scripts/build-iso27001-pack.mjs, then read the module titles.)
```

Deleting a `shared_quiz` or `phishing_template` does **not** affect any tenant that already cloned it — clones are independent copies, by design.

Code rollback: `git revert <commit>`.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `expected 30 ISO quizzes, found 0` | Load has not run, or ran against another database | Confirm the first line of the checker output shows the intended host; re-run Part 5 |
| Migration hangs or errors on port `6543` | Transaction pooler cannot hold the advisory lock | Use the direct/Session pooler URL (`5432`) for `prisma:deploy` |
| `Refusing to seed with the built-in demo password in production` | `npm run seed` used instead of `npm run seed:content` | Use `npm run seed:content` (it is exempt by design) |
| `DATABASE_URL is not set` | Env file not passed / not sourced | `node --env-file=...` for the checker; `set -a; . file; set +a` for npm scripts |
| `/shared-quizzes` returns 404 | Stale API process or undeployed code | Part 2 locally, Part 7 in production |
| `ECONNREFUSED` / timeout to Supabase | Outbound TCP 5432 blocked by the runner | Run the load from a network that allows it, or from the Supabase SQL editor for queries |
| Permission denied on `create table` during migrate | DB role lacks DDL rights | Run migrations with the `postgres` role |
| A lure is rejected by the composer | Body has no `{{TRACKING_URL}}` | The generator now fails on this; re-run 2.2 and fix the document |

---

## 11. Safety rules

1. **Never run `npm run seed` against production.** Only `npm run seed:content`.
2. **Always run the pre-flight checker first** (Part 4). Confirm the host before writing.
3. **Keep credentials out of the repository.** Use `/tmp` or the environment, and add `.env.*` to `.gitignore`.
4. **Do not hand-edit** `api/prisma/content/iso27001-awareness-pack.ts`. Edit the document and re-run the generator.
5. **Gate on `--strict`.** A non-zero exit means the pack is incomplete; do not report success.
6. **Both loads are idempotent.** If a step is interrupted, re-running it is safe and correct.

---

## 12. Quick copy-paste sequence

```bash
# --- Local verification -------------------------------------------------
cd <ROOT>/api && npm run seed:content
cd <ROOT>/api && node --env-file=.env scripts/check-content-pack.mjs --strict
lsof -ti tcp:3001 | xargs kill          # stop the stale local API
cd <ROOT>/api && npm run start:dev      # then verify /shared-quizzes returns 30

# --- Production load ----------------------------------------------------
cd <ROOT>/api
node --env-file=/tmp/vlumeaware-prod.env scripts/check-content-pack.mjs      # PRE-FLIGHT: confirm host
set -a; . /tmp/vlumeaware-prod.env; set +a
npm run seed:content
node --env-file=/tmp/vlumeaware-prod.env scripts/check-content-pack.mjs --strict   # GATE: exit 0

# --- Deploy the code ----------------------------------------------------
cd <ROOT>
grep -q '^\.env\.' .gitignore || printf '.env.*\n!.env.example\n' >> .gitignore
git add -A && git status --short      # confirm no .env staged
git commit -m "ISO 27001:2022 awareness content pack: 30 quizzes, 24 lures, loader and verification"
git push origin fix/guide-readability
# merge to main per your deploy process, then verify the live API
```

---

## 13. What cannot be shipped yet

| Item | Blocker |
|---|---|
| Real training videos | The 10 modules use placeholder URLs (`videos.vlumetech.example/...`). `shared_training_modules` has no `script` column, so the narration outlines in the generated pack are not persisted. |
| Brochure, 15 email templates, campaign runbook | No database table exists. They remain documents by decision. |
| 6 non-email scenarios (SMS, voice, QR, chat apps, removable media) | The platform sends email only. Excluded from the cloneable catalogue on purpose; they remain in the document and quiz bank. |
