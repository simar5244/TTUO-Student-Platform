# TTU Online Admissions Portal ("April" project)

Mobile-first admissions portal for TTU Online. Black/white UI with minimal red (#cc0000) accent.

## Stack
- Next.js 16 (App Router) + React 19 + Tailwind v4 + TypeScript
- `pg` (node-postgres) — two logical pools via `src/lib/db.ts`:
  - `appPool` → `DATABASE_URL`, `search_path` = `APP_SCHEMA` (default `AH`) — app-owned `portal_*` tables
  - `whPool` → `WAREHOUSE_URL` — read-only Salesforce mirror in `sf_origin` schema
- Auth: scrypt password hashes, DB sessions + JWT cookie (`ah_session`), Twilio Verify for MFA (mock code `424242` when TWILIO_* unset)
- Chat: DB-persisted threads + polling (no websockets needed at this scale)

## Golden rule: NEVER write to sf_origin or other warehouse mirror tables
The warehouse is read-only to us. Any change that must reach Salesforce goes into
`AH.portal_outbox` — the superadmin applies each row in SF manually, then marks it done
at /admin/outbox. Record merges in SF are likewise manual (our `portal_identity_links`
is the source of truth for portal↔SF identity).

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

## Roles
- student: /portal (apply, checklist, docs, chat, profile/MFA)
- advisor: dashboard, leads, applications, review queue, chat, person 360
- manager: + match/merge queue, status overrides → outbox, analytics
- admin: + staff management, full audit trail, SF outbox

## Deployment
Deploy on tosmonline0003.ttu.edu with `DATABASE_URL`/`WAREHOUSE_URL` pointing at
`lumen_warehouse` (localhost on the box — port 5432 isn't exposed). App tables go in
schema `AH` (needs a DB role with CREATE rights — run migrate.sql as `lumen_app` or
whichever role owns AH). No Docker. `npm run build && npm run start`.

## Pending inputs from owner
- Real requirement/checklist list per program (currently `portal_checklist_templates` has a seeded default)
- Twilio creds: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SID` in `.env.local`
- Custom chatbot endpoint → `BOT_ENDPOINT` (POST `{message, user}` → `{reply}`)
