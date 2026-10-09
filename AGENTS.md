# TTU Online Admissions Portal ("April" project)

Mobile-first admissions portal for TTU Online. Black/white UI with minimal red (#cc0000) accent.

## Stack
- Next.js 16 (App Router) + React 19 + Tailwind v4 + TypeScript
- `pg` (node-postgres) — two logical pools via `src/lib/db.ts`:
  - `appPool` → `DATABASE_URL`, `search_path` = `APP_SCHEMA` (default `AH`) — app-owned `portal_*` tables AND the `sf_*` clone
  - `whPool` → `WAREHOUSE_URL` — read-only Salesforce mirror in `sf_origin` schema (sync source only)
- Sync engine (`src/lib/sync.ts`, started in `instrumentation.ts`): clones the TTU-Online
  slice of `sf_origin` into `AH.sf_contact` / `sf_application` / `sf_checklist_item` /
  `sf_term` / `sf_program` / `sf_recordtype` every `SYNC_INTERVAL_MINUTES` (5–30,
  default 15, 0=off). Upsert by SF Id; changed rows also append to `sf_*_hist`
  (append-only). Also: detects new SF applications for linked contacts (intent →
  `submitted`) and flips `pushed` portal documents to `approved` on SF checklist
  parity. Manual trigger: /admin/sync "Refresh now" (manager/admin). Every run logged
  in `sf_sync_runs`. All request-time SF reads hit the clone via `src/lib/sf.ts` —
  only sync.ts, `ensureCloned`, and person-360 interactions touch the warehouse.
- Checklist source of truth = `AH.checklist_items` in the warehouse (Lumen connector
  `3e0ca7b6`, "SF Checklist Items → AH", from `TargetX_SRMb__Checklist_Item__c`),
  cloned per sync into `sf_checklist_item` (TTU-Online apps only). Local
  `portal_checklist_items` is the fallback while no SF app exists.
- Identity: `scoreCandidates` in sf.ts scores a signup vs clone (email 40 / phone 35 /
  last+former-last 15 / first+nickname 10 → 0–100). Tiers: all-of email+phone+name ⇒
  `auto_full` link; email+phone but name mismatch ⇒ `auto_pair` link + `flagged` lane;
  exactly one field ⇒ `pending_review` candidates; none ⇒ `none` + warehouse-wide
  browse in /admin/match. SF mailing address is reviewer context only.
- Apply = RaiderConnect handoff: `/portal/apply` picks modality+program
  (`portal_programs`, mirrors the RC picker) + term, saves an intent row
  (`rc_started`), same-tab redirect to `texastech.my.site.com/online/TX_SiteLogin`
  (RC sends `frame-ancestors 'self'` — CANNOT be iframed). On return (focus/30s
  poll/"check now") the app detects the new SF application and flips intent →
  `submitted`.
- Documents: uploads default `pending_review` → advisor pushes into Salesforce via
  RaiderConnect + marks `pushed` at /admin/documents → sync sets `approved` only on
  SF parity (`received`/`closed`/`waived` on the linked checklist item).
- `portal_application_events` = append-only status timeline (stateful). 
  `portal_contact_projection` = generated columns per linked SF contact (portal user,
  app status, history JSON, checklist progress) — rebuilt each sync + on link/status writes.
- Auth: scrypt password hashes, DB sessions + JWT cookie (`ah_session`), Twilio Verify for MFA (mock code `424242` when TWILIO_* unset)
- Chat: DB-persisted threads + polling (no websockets needed at this scale)

## Golden rule: NEVER write to sf_origin or other warehouse mirror tables
The warehouse is read-only to us. Any change that must reach Salesforce goes into
`AH.portal_outbox` — the superadmin applies each row in SF manually, then marks it done
at /admin/outbox. Record merges in SF are likewise manual (our `portal_identity_links`
is the source of truth for portal↔SF identity). The `AH.sf_*` clone tables are
app-owned and writable — the sync engine is the only writer.

## Local dev
```bash
./scripts/db.sh start          # postgres 16 cluster lives in ./pgdata, port 5433
npm run dev                    # http://localhost:3000
./scripts/db.sh stop
psql $DATABASE_URL -v schema=AH -f scripts/migrate.sql   # migrate
node scripts/create-user.mjs <email> <pass> <role> [name] # create staff
```
Seeded staff (dev only): admin@ttu.edu / advisor@ttu.edu / manager@ttu.edu — see password manager or recreate.

Sample warehouse data lives in `samples/*.csv` (32K applications, 50K contacts,
terms, programs). Reload: `psql -d april_app -h localhost -p 5433 -U postgres -f scripts/load_samples.sql`.

## Warehouse schema notes (sf_origin)
- Leads = `contact` rows with record type "Prospective Student"; lifecycle in `TargetX_SRMb__Status__c` (Prospect→Inquiry→Applicant→Admit→Confirmed→Enrolled)
- `application` links via `TargetX_SRMb__Contact__c`; term text in `TargetX_SRMb__Start_Term_and_Year__c` ("Fall 2026", "Early Fall 2026", "Late Fall 2026", …)
- Record types on `application` include "TTU Online"; terms in `ttu_term__c`; programs in `ttu_academic_program__c` (`TTU_isOnline_Program__c` flag)
- `AH.applications` + `AH.tracker` view = April's existing curated applicant layer
- The clone slice (`CONTACT_SLICE` in sync.ts): `Campus_Inquiry__c='Distance Learning'`
  OR `TTU_Online_Student__c` OR online lead-source OR `TargetX_SRMb__Campus__c='TUO'`
  OR owns a TTU Online application ≈ 76.5K of 3.6M contacts. (The earlier
  `IS NOT NULL`/status limbs matched the whole table — empty strings aren't NULL.)
  Checklist items clone only for TTU Online apps (55K of 1.46M). Interactions are
  NOT cloned — person-360 reads `sf_origin.interaction` via `whPool`.
- View `sf_contact_portal` = clone + projection stitched (SF record with portal columns).

## Roles
- student: /portal (apply→RaiderConnect, checklist, docs, chat, profile/MFA)
- advisor: dashboard, leads, applications, /admin/documents queue, chat, person 360
- manager: + match/merge queue, status overrides → outbox, analytics, /admin/sync
- admin: + staff management, full audit trail, SF outbox, /admin/sync

## Deployment (live)
- Public URL `https://tosmonline0001.ttu.edu/sim/AHPortal/` (real cert, nginx edge).
- App runs on **tosmonline0001** (PM2, `~/ahportal/ecosystem.config.cjs`):
  - `april-web` → `next start -p 3210` (`NEXT_BASE_PATH=/sim/AHPortal` in `.env.local`)
  - `ahportal-db-tunnel` → `ssh -N -L 127.0.0.1:55432:127.0.0.1:5432 tosmonline0003`
    (key auth already in place; DBs live on 0003 where Postgres binds localhost)
  - `pm2 save` done for both.
- `DATABASE_URL` → `postgres://ahportal@127.0.0.1:55432/AHPortalDB` (schema `"AH"`);
  `WAREHOUSE_URL` → same tunnel, `lumen_warehouse` (SELECT-only `sf_origin`+`AH`).
  `PGSSLMODE=disable`.
- nginx mount in `/etc/nginx/conf.d/chatbot.conf` (0001): `location /sim/AHPortal/` +
  `location = /sim/AHPortal` → `http://127.0.0.1:3210` with `X-Forwarded-Host/Proto`
  set (CSRF check in `src/lib/security.ts` reads `x-forwarded-host`). Backup files
  `chatbot.conf.bak-ahportal-*` exist next to it.
- **Build must be `next build --webpack`** (npm build script does this) — box glibc
  2.28 can't load the SWC native binary. `next.config.ts` is ESM: no
  `require`/`__dirname`; `NEXT_BASE_PATH` via `process.env`. Edge bundle aliases
  `src/lib/sync.ts` → `src/lib/sync.edge.ts` (stub) so `pg` stays out of edge code.
- Public assets: reference via `asset()` from `src/lib/asset.ts` (basePath prefix) —
  bare `/logo.png` style paths 404 under the tenant mount.
- Deploy flow: rsync repo → `npm ci && npm run build` → `pm2 reload april-web`.
  SSH via `~/Desktop/Data/.runtime/remote-psql.mjs` (`SSH_HOST` env selects 0001/0003,
  password auth, ssh2) + `custom_scripts/remote-sftp.mjs` for uploads.
- on 0003 only the data side remains: `AHPortalDB`, `ahportal` role, Lumen connector
  `3e0ca7b6` (SF Checklist Items → `AH.checklist_items`).

## Behavior notes (Oct 2026)
- **Matching**: name fields also compare as tokens of the SF `Name` column —
  SF stores some leads reversed ("Last First") or single-field, so exact
  FirstName/LastName compares alone miss real people (`scoreFields` in sf.ts).
- **Checklist "done"**: SF `item_received`/`status` values include
  `Not Received`/`Not Started` — `CHECKLIST_DONE` in sf.ts (mirrored inline in
  sync.ts projection + `confirmPushedDocs`) uses anchored regexes; an
  unanchored match counts "Not Received" as received.
- **Merged checklist**: `studentChecklist` in `src/lib/checklist.ts` is THE
  student checklist — SF items first, portal uploads overlaid, local
  `portal_checklist_items` fallback. `/api/checklist`, `/api/me`, and
  `/portal` all read it; never recompute locally.
- **Student UX is link-blind**: portal pages never mention matching/linking.
  `portal_identity_links`/`match_fields` stay staff-only (admin/match).
- **Terms gate**: signup requires `agreed:true` → `portal_users.terms_accepted_at`.
  Public `/terms` page; it is a third-party app disclaimer (not official TTU).
- **Apply gating**: `APPLY_ENABLED=true` re-enables `/portal/apply` +
  `POST /api/applications intent`. Default off — nav item and mascot CTA hide.
- **Match admin**: `/admin/match` groups candidates by matched-field signature
  (email → +phone → +first → +last); `?preview=<sfContactId>` renders the
  modal; `?browse=<term>` searches the whole warehouse (outside the clone);
  `ensureCloned` pulls a browsed contact in before linking.
- **Endowed progress**: `metaItems` in `src/lib/checklist.ts` prepends real
  completed milestones (account created, application submitted) to every
  checklist response — a fresh signup reads "1 of 2", never 0. Meta ids are
  `meta-*`, carry no upload affordance, and never count SF work as done.
- **Item reminders**: bell on an open checklist item → date pick → one SMS
  that morning (implementation intention). `portal_reminders` table; the sync
  loop's tick calls `sendDueReminders` (src/lib/reminders.ts) after each run
  and at boot. Sends via Twilio **Messages** API (Verify can't send free
  text): needs `TWILIO_FROM` (E.164) or `TWILIO_MESSAGING_SID` plus the
  existing SID/TOKEN; `PORTAL_BASE_URL` adds the deep link. Without them the
  reminder is recorded `no_twilio` — degrades silently, never blocks.
  Server enforces consent (`confirm_sms`), a real phone on file, ≤90 days.
- **Password change**: `POST /api/profile {action:"change_password",
  current, next}` — verifies current via `checkPassword`, applies
  `passwordIssue` policy, rehashes with `hashPassword`, audits.
- **Client fetches** use `cache:"no-store"` — Safari's bfcache otherwise
  shows stale portal shells on mobile.
- **Account deletion**: Profile → "Delete my account" → `POST /api/profile
  {action:"delete_account", confirm:true}`. Uploads are unlinked from disk,
  then `portal_users` DELETE cascades everything user-owned (incl.
  reminders); `portal_activity`/`portal_notes` retain anonymized rows via
  SET NULL. Session cookie is cleared in the response.

## Pending inputs from owner
- APPLY_ENABLED=true when apply flow is whitelisted (still set false on 0001)
- General Business program requirements (SF side not finalized — portal shows "coming soon")
- Twilio creds: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SID` in `.env.local`
  (reminders additionally need `TWILIO_FROM` or `TWILIO_MESSAGING_SID`, + `PORTAL_BASE_URL`)
- Custom chatbot endpoint → `BOT_ENDPOINT` (POST `{message, user}` → `{reply}`)
