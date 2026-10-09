-- Portal schema. Run: psql -d <db> -v schema=AH -f scripts/migrate.sql
\set ON_ERROR_STOP on
CREATE SCHEMA IF NOT EXISTS :"schema";
SET search_path TO :"schema", public;

CREATE TABLE IF NOT EXISTS portal_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  phone         text,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'student' CHECK (role IN ('student','advisor','manager','admin')),
  display_name  text,
  mfa_enabled   boolean NOT NULL DEFAULT false,
  mfa_phone     text,
  disabled      boolean NOT NULL DEFAULT false,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
-- upgrades for existing installs
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS failed_attempts int NOT NULL DEFAULT 0;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS locked_until timestamptz;

CREATE TABLE IF NOT EXISTS portal_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ip         text,
  ua         text
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON portal_sessions(user_id);

CREATE TABLE IF NOT EXISTS portal_otp (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES portal_users(id) ON DELETE CASCADE,
  purpose    text NOT NULL,            -- 'login_mfa' | 'password_reset' | 'phone_verify'
  channel    text NOT NULL DEFAULT 'sms',
  destination text,
  code_hash  text,                     -- dev/mock path stores hash; Twilio Verify keeps it server-side
  twilio_sid text,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  attempts   int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_identity_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  sf_contact_id text,
  match_type    text NOT NULL,          -- 'auto_full' | 'auto_partial' | 'manual' | 'none'
  match_fields  jsonb NOT NULL DEFAULT '{}',  -- {email: true, phone: true, name: true}
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending_review','confirmed','rejected')),
  reviewed_by   uuid REFERENCES portal_users(id),
  reviewed_at   timestamptz,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_links_user ON portal_identity_links(user_id) WHERE status IN ('active','confirmed','pending_review');
CREATE INDEX IF NOT EXISTS idx_links_contact ON portal_identity_links(sf_contact_id);

-- Application started inside the portal (no SF application row yet)
CREATE TABLE IF NOT EXISTS portal_applications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  sf_application_id text,                       -- filled once a matching SF app is found/linked
  term              text,
  term_id           text,
  program_id        text,
  program_name      text,
  degree            text,
  student_type      text,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','admitted','denied','withdrawn')),
  answers           jsonb NOT NULL DEFAULT '{}',
  submitted_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_papps_user ON portal_applications(user_id);

CREATE TABLE IF NOT EXISTS portal_checklist_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  program_id text,                        -- null = default for all programs
  term       text,
  items      jsonb NOT NULL,              -- [{key,label,required,description,accepts_upload}]
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_checklist_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    uuid REFERENCES portal_applications(id) ON DELETE CASCADE,
  sf_application_id text,                 -- checklist can also attach to an SF-side app
  user_id           uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  key               text NOT NULL,
  label             text NOT NULL,
  required          boolean NOT NULL DEFAULT true,
  sort_order        int NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'not_started'
                    CHECK (status IN ('not_started','in_progress','submitted','approved','rejected','waived')),
  note              text,
  reviewed_by       uuid REFERENCES portal_users(id),
  reviewed_at       timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checklist_app ON portal_checklist_items(application_id);
CREATE INDEX IF NOT EXISTS idx_checklist_user ON portal_checklist_items(user_id);

CREATE TABLE IF NOT EXISTS portal_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  application_id    uuid REFERENCES portal_applications(id) ON DELETE SET NULL,
  checklist_item_id uuid REFERENCES portal_checklist_items(id) ON DELETE SET NULL,
  filename          text NOT NULL,
  stored_name       text NOT NULL,
  mime              text,
  size              int,
  status            text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','approved','rejected')),
  note              text,
  reviewed_by       uuid REFERENCES portal_users(id),
  reviewed_at       timestamptz,
  uploaded_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_docs_user ON portal_documents(user_id);

-- Every admin-side change that must later be applied to Salesforce BY HAND (superadmin)
CREATE TABLE IF NOT EXISTS portal_outbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,              -- 'application' | 'contact' | 'link' | 'checklist'
  entity_id   text NOT NULL,              -- sf id or portal uuid
  action      text NOT NULL,              -- e.g. 'set_status', 'merge_link', 'decision'
  payload     jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','skipped')),
  actor_id    uuid REFERENCES portal_users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  done_by     uuid REFERENCES portal_users(id),
  done_at     timestamptz,
  note        text
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON portal_outbox(status);

-- Full activity trail: page views, clicks, logins, admin actions (students AND staff)
CREATE TABLE IF NOT EXISTS portal_activity (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  session_id  text,
  kind        text NOT NULL,              -- 'page_view','click','action','login','logout','admin_action','heartbeat'
  path        text,
  detail      jsonb NOT NULL DEFAULT '{}',
  duration_ms int,
  ip          text,
  ua          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON portal_activity(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_time ON portal_activity(created_at);

CREATE TABLE IF NOT EXISTS portal_chat_threads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  subject     text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','claimed','closed')),
  claimed_by  uuid REFERENCES portal_users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_threads_user ON portal_chat_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_threads_status ON portal_chat_threads(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS portal_chat_messages (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thread_id  uuid NOT NULL REFERENCES portal_chat_threads(id) ON DELETE CASCADE,
  sender_id  uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  sender_kind text NOT NULL CHECK (sender_kind IN ('student','admin','bot')),
  body       text NOT NULL,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msgs_thread ON portal_chat_messages(thread_id, id);

CREATE TABLE IF NOT EXISTS portal_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sf_contact_id  text,
  sf_application_id text,
  user_id        uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  author_id      uuid NOT NULL REFERENCES portal_users(id),
  body           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_contact ON portal_notes(sf_contact_id);

-- Seed: default checklist template for TTU Online applicants (replace with real list)
INSERT INTO portal_checklist_templates (name, items)
SELECT 'TTU Online Default', '[
  {"key":"application","label":"Application form submitted","required":true,"accepts_upload":false,"description":"Complete and submit the application form"},
  {"key":"gov_id","label":"Government-issued ID","required":true,"accepts_upload":true,"description":"Driver license, passport, or state ID"},
  {"key":"transcripts","label":"Official transcripts","required":true,"accepts_upload":true,"description":"All prior institutions attended"},
  {"key":"resume","label":"Resume / CV","required":false,"accepts_upload":true,"description":"Current resume or CV"},
  {"key":"sop","label":"Statement of purpose","required":false,"accepts_upload":true,"description":"Why this program, career goals"},
  {"key":"fee","label":"Application fee","required":true,"accepts_upload":false,"description":"Fee payment or approved waiver"}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM portal_checklist_templates WHERE name='TTU Online Default');

-- =====================================================================
-- Salesforce clone + identity pipeline
-- The app never reads sf_origin at request time: a sync engine refreshes
-- these flat clone tables every SYNC_INTERVAL_MINUTES (5-30, default 15).
-- Clone = current state (upsert by SF Id). *_hist = append-only history:
-- every row whose content hash changed gets copied in, so no state is lost.
-- =====================================================================

CREATE TABLE IF NOT EXISTS sf_contact (
  id              text PRIMARY KEY,          -- SF "Id"
  name            text,
  first_name      text,
  last_name       text,
  pref_first      text,                      -- TTU_Preferred_First_Name__c
  nickname        text,                      -- Alias_Nickname__c
  former_last     text,                      -- Former last name (either TargetX or hed__ field)
  email           text,
  emails          text[] NOT NULL DEFAULT '{}',  -- every email field on the record, lowercased
  phone           text,
  mobile_phone    text,
  phones          text[] NOT NULL DEFAULT '{}',  -- normalized digits of every phone field
  status          text,
  record_type     text,
  lead_source     text,
  term            text,
  street          text,
  city            text,
  state           text,
  zip             text,
  banner_id       text,
  online_student  boolean,
  is_duplicate    boolean,
  sf_created      timestamptz,
  sf_modified     timestamptz,
  row_hash        text NOT NULL,             -- md5 over synced columns (computed source-side)
  synced_at       timestamptz NOT NULL DEFAULT now()  -- when this row last changed in the clone
);
CREATE INDEX IF NOT EXISTS idx_sfc_status   ON sf_contact(status);
CREATE INDEX IF NOT EXISTS idx_sfc_term     ON sf_contact(term);
CREATE INDEX IF NOT EXISTS idx_sfc_last     ON sf_contact(lower(last_name));
CREATE INDEX IF NOT EXISTS idx_sfc_emails   ON sf_contact USING gin(emails);
CREATE INDEX IF NOT EXISTS idx_sfc_phones   ON sf_contact USING gin(phones);

CREATE TABLE IF NOT EXISTS sf_application (
  id            text PRIMARY KEY,
  app_number    text,                        -- SF "Name" (application number)
  record_type   text,
  stage         text,
  status        text,
  term          text,
  decision      text,
  review_status text,
  submitted     timestamptz,
  contact_id    text,
  program_id    text,
  program_name  text,
  student_type  text,
  sf_created    timestamptz,
  sf_modified   timestamptz,
  row_hash      text NOT NULL,
  synced_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sfa_contact ON sf_application(contact_id);
CREATE INDEX IF NOT EXISTS idx_sfa_term    ON sf_application(term);
CREATE INDEX IF NOT EXISTS idx_sfa_status  ON sf_application(status);
CREATE INDEX IF NOT EXISTS idx_sfa_stage   ON sf_application(stage);

-- Append-only history: one row per observed version (row_hash dedupe).
CREATE TABLE IF NOT EXISTS sf_contact_hist (
  hist_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  observed_at  timestamptz NOT NULL DEFAULT now(),
  LIKE sf_contact
);
CREATE INDEX IF NOT EXISTS idx_sfch_id ON sf_contact_hist(id, observed_at);

CREATE TABLE IF NOT EXISTS sf_application_hist (
  hist_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  observed_at  timestamptz NOT NULL DEFAULT now(),
  LIKE sf_application
);
CREATE INDEX IF NOT EXISTS idx_sfah_id ON sf_application_hist(id, observed_at);

-- Small reference clones (full upsert each run, no history).
CREATE TABLE IF NOT EXISTS sf_recordtype (
  id text PRIMARY KEY, name text, synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sf_term (
  id text PRIMARY KEY, name text, start_date timestamptz, synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sf_program (
  id text PRIMARY KEY, name text, degree text, college text,
  is_online boolean, synced_at timestamptz NOT NULL DEFAULT now()
);

-- Audit trail for the sync engine itself.
CREATE TABLE IF NOT EXISTS sf_sync_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trigger     text NOT NULL,               -- 'schedule' | 'manual' | 'boot'
  actor_id    uuid REFERENCES portal_users(id),
  status      text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error','skipped')),
  stats       jsonb NOT NULL DEFAULT '{}', -- {contact:{seen,changed}, application:{...}, ...}
  error       text,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_sync_runs ON sf_sync_runs(started_at DESC);

-- Stateful pipeline: every portal application status transition, forever.
CREATE TABLE IF NOT EXISTS portal_application_events (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES portal_applications(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES portal_users(id) ON DELETE SET NULL, -- the student
  from_status    text,
  to_status      text NOT NULL,
  actor_id       uuid REFERENCES portal_users(id) ON DELETE SET NULL, -- who caused it
  actor_kind     text NOT NULL DEFAULT 'student',                     -- 'student'|'admin'|'system'
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_events_app  ON portal_application_events(application_id, created_at);
CREATE INDEX IF NOT EXISTS idx_app_events_user ON portal_application_events(user_id, created_at);

-- The "generated columns": for every linked SF contact, the portal-side state
-- stitched on — rebuilt each sync and refreshed on every link/status change.
CREATE TABLE IF NOT EXISTS portal_contact_projection (
  sf_contact_id           text PRIMARY KEY,
  portal_user_id          uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  link_status             text,
  link_match_type         text,
  link_confidence         int,
  portal_app_id           uuid,
  portal_app_status       text,
  portal_app_program      text,
  portal_app_term         text,
  portal_app_submitted_at timestamptz,
  portal_app_status_at    timestamptz,
  portal_app_history      jsonb NOT NULL DEFAULT '[]',  -- [{from,to,at,by}]
  checklist_done          int NOT NULL DEFAULT 0,
  checklist_total         int NOT NULL DEFAULT 0,
  last_portal_activity_at timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Clone + projection stitched together = "the SF record with portal columns".
-- The full definition is created at the end of this file once every
-- projection column exists (see the v2 block); kept as a stub comment here so
-- re-runs stay idempotent.

-- Match confidence lives on the link row.
ALTER TABLE portal_identity_links ADD COLUMN IF NOT EXISTS confidence int NOT NULL DEFAULT 0;

-- =====================================================================
-- 2026-10-09 — RaiderConnect handoff + SF checklist/documents (AHPortalDB)
-- =====================================================================

-- Auto-linked pairs still need a human glance: email+phone only (no name
-- match) auto-links but is flagged for the match queue.
ALTER TABLE portal_identity_links ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;
ALTER TABLE portal_identity_links ADD COLUMN IF NOT EXISTS flag_reason text;

-- Per-application checklist rollups + decision fields, cloned from the raw
-- sf_origin.application columns (they aren't part of AH.applications).
ALTER TABLE sf_application ADD COLUMN IF NOT EXISTS open_checklist int;
ALTER TABLE sf_application ADD COLUMN IF NOT EXISTS checklist_total int;
ALTER TABLE sf_application ADD COLUMN IF NOT EXISTS checklist_done int;
ALTER TABLE sf_application ADD COLUMN IF NOT EXISTS pct_complete numeric;
ALTER TABLE sf_application ADD COLUMN IF NOT EXISTS app_state text;
ALTER TABLE sf_application ADD COLUMN IF NOT EXISTS completed_date timestamptz;
ALTER TABLE sf_application ADD COLUMN IF NOT EXISTS items_received_date timestamptz;
ALTER TABLE sf_application ADD COLUMN IF NOT EXISTS decision_display text;
ALTER TABLE sf_application ADD COLUMN IF NOT EXISTS decision_published_at timestamptz;
ALTER TABLE sf_application ADD COLUMN IF NOT EXISTS campus text;
ALTER TABLE sf_application ADD COLUMN IF NOT EXISTS level text;
ALTER TABLE sf_application ADD COLUMN IF NOT EXISTS is_test boolean;
ALTER TABLE sf_application ADD COLUMN IF NOT EXISTS fee_received boolean;
-- hist was created LIKE sf_application before these columns existed — keep parity
ALTER TABLE sf_application_hist ADD COLUMN IF NOT EXISTS open_checklist int;
ALTER TABLE sf_application_hist ADD COLUMN IF NOT EXISTS checklist_total int;
ALTER TABLE sf_application_hist ADD COLUMN IF NOT EXISTS checklist_done int;
ALTER TABLE sf_application_hist ADD COLUMN IF NOT EXISTS pct_complete numeric;
ALTER TABLE sf_application_hist ADD COLUMN IF NOT EXISTS app_state text;
ALTER TABLE sf_application_hist ADD COLUMN IF NOT EXISTS completed_date timestamptz;
ALTER TABLE sf_application_hist ADD COLUMN IF NOT EXISTS items_received_date timestamptz;
ALTER TABLE sf_application_hist ADD COLUMN IF NOT EXISTS decision_display text;
ALTER TABLE sf_application_hist ADD COLUMN IF NOT EXISTS decision_published_at timestamptz;
ALTER TABLE sf_application_hist ADD COLUMN IF NOT EXISTS campus text;
ALTER TABLE sf_application_hist ADD COLUMN IF NOT EXISTS level text;
ALTER TABLE sf_application_hist ADD COLUMN IF NOT EXISTS is_test boolean;
ALTER TABLE sf_application_hist ADD COLUMN IF NOT EXISTS fee_received boolean;

-- Clone of TargetX_SRMb__Checklist_Item__c (piped to AH.checklist_items in the
-- warehouse by the "SF Checklist Items -> AH" Lumen connector). Per-item state:
-- what the requirement is, whether SF received/closed/waived it.
CREATE TABLE IF NOT EXISTS sf_checklist_item (
  id              text PRIMARY KEY,
  name            text,                      -- item label, e.g. "HS Transcript"
  application_id  text,                      -- -> sf_application.id
  app_type        text,
  status          text,                      -- SF picklist: Open/Received/Waived/…
  req_code        text,                      -- TargetX_SRMb__REQ_CODE__c
  item_received   text,                      -- TTU_Item_Received__c (doc name)
  description     text,
  long_description text,
  assigned        boolean,
  is_closed       boolean,
  waived          boolean,
  not_required    boolean,
  related_to      text,
  visibility      text,
  system_generated boolean,
  checkbox_field  text,
  record_type_id  text,
  is_deleted      boolean,
  sf_created      timestamptz,
  sf_modified     timestamptz,
  row_hash        text NOT NULL,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sfci_app ON sf_checklist_item(application_id);
CREATE INDEX IF NOT EXISTS idx_sfci_req ON sf_checklist_item(req_code);

CREATE TABLE IF NOT EXISTS sf_checklist_item_hist (
  hist_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  observed_at timestamptz NOT NULL DEFAULT now(),
  LIKE sf_checklist_item
);
CREATE INDEX IF NOT EXISTS idx_sfcih_id ON sf_checklist_item_hist(id, observed_at);

-- portal_documents: student uploads wait for a human to push them into
-- RaiderConnect/Salesforce. pending_review -> pushed (admin did the SF upload
-- by hand) -> approved (next sync saw the item received in SF) | rejected.
ALTER TABLE portal_documents DROP CONSTRAINT IF EXISTS portal_documents_status_check;
UPDATE portal_documents SET status='pending_review' WHERE status='uploaded';
ALTER TABLE portal_documents ALTER COLUMN status SET DEFAULT 'pending_review';
ALTER TABLE portal_documents ADD CONSTRAINT portal_documents_status_check
  CHECK (status IN ('pending_review','pushed','approved','rejected'));
ALTER TABLE portal_documents ADD COLUMN IF NOT EXISTS req_key text;          -- checklist key or SF REQ_CODE
ALTER TABLE portal_documents ADD COLUMN IF NOT EXISTS sf_item_id text;       -- sf_checklist_item.id it satisfies
ALTER TABLE portal_documents ADD COLUMN IF NOT EXISTS sf_application_id text;
ALTER TABLE portal_documents ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE portal_documents ADD COLUMN IF NOT EXISTS sf_confirmed_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_docs_status ON portal_documents(status);

-- portal_applications is now the apply-intent + tracker row: the real
-- application is created inside RaiderConnect; we record what they picked,
-- when we sent them over, and which SF application we detected afterwards.
ALTER TABLE portal_applications DROP CONSTRAINT IF EXISTS portal_applications_status_check;
ALTER TABLE portal_applications ADD CONSTRAINT portal_applications_status_check
  CHECK (status IN ('draft','rc_started','submitted','under_review','admitted','denied','withdrawn'));
ALTER TABLE portal_applications ADD COLUMN IF NOT EXISTS modality text;      -- '8-week' | '16-week'
ALTER TABLE portal_applications ADD COLUMN IF NOT EXISTS rc_program text;    -- picker label (RaiderConnect wording)
ALTER TABLE portal_applications ADD COLUMN IF NOT EXISTS rc_opened_at timestamptz;
ALTER TABLE portal_applications ADD COLUMN IF NOT EXISTS sf_detected_at timestamptz;

-- The RaiderConnect "Academic Program" catalog — mirrors what the apply
-- dropdown offers (screenshots 2026-10-09). 8-week = the full online list;
-- 16-week = Education (TechTeach) only. sf_program_id resolved lazily by name.
CREATE TABLE IF NOT EXISTS portal_programs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL,
  modality      text NOT NULL DEFAULT '8-week' CHECK (modality IN ('8-week','16-week')),
  level         text NOT NULL DEFAULT 'UG',
  degree        text,
  sf_program_id text,
  sort          int NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_programs_label ON portal_programs(label, modality);

INSERT INTO portal_programs (label, modality, level, degree, sort) VALUES
  ('Education, Bachelor of Science (Associate of Arts in Teaching Required, 2.75 GPA Minimum, Must Live in Partnership School District in Texas)','16-week','UG','BS',0),
  ('Anthropology, Bachelor of Arts','8-week','UG','BA',10),
  ('Applied Personal Finance, Bachelor of Science','8-week','UG','BS',20),
  ('BAAS Applied Leadership (Associate of Applied Arts or Science Required)','8-week','UG','BAAS',30),
  ('Communication Studies, Bachelor of Arts','8-week','UG','BA',40),
  ('Computing Applications, Bachelor of Science','8-week','UG','BS',50),
  ('Counseling & Addiction Recovery Sciences, Bachelor of Science','8-week','UG','BS',60),
  ('Criminology, Bachelor of Arts','8-week','UG','BA',70),
  ('Digital Media & Professional Communication, Bachelor of Arts','8-week','UG','BA',80),
  ('Emergency Management BAAS','8-week','UG','BAAS',90),
  ('English, Bachelor of Arts','8-week','UG','BA',100),
  ('General Business, Bachelor of Business Administration','8-week','UG','BBA',110),
  ('General Studies AS BGS','8-week','UG','BGS',120),
  ('History, Bachelor of Arts','8-week','UG','BA',130),
  ('Human Centered Artificial Intelligence, Bachelor of Science','8-week','UG','BS',140),
  ('Human Development & Family Sciences, Bachelor of Science','8-week','UG','BS',150),
  ('Human Resources Development, Bachelor of Arts','8-week','UG','BA',160),
  ('Human Sciences, Bachelor of Applied Arts & Sciences (Associates of Applied Sciences Required)','8-week','UG','BAAS',170),
  ('Human Sciences, Bachelor of Science','8-week','UG','BS',180),
  ('Interdisciplinary Studies, Bachelor of Arts','8-week','UG','BA',190),
  ('Kinesiology, Bachelor of Science','8-week','UG','BS',200),
  ('Leadership Studies, Bachelor of Science','8-week','UG','BS',210),
  ('Legal Studies, BAAS','8-week','UG','BAAS',220),
  ('Legal Studies, Bachelor of Arts','8-week','UG','BA',230),
  ('Non Degree','8-week','UG',NULL,240),
  ('Organizational Leadership, Bachelor of Arts','8-week','UG','BA',250),
  ('Plant & Soil Sciences, Bachelor of Science','8-week','UG','BS',260),
  ('Political Science, Bachelor of Arts','8-week','UG','BA',270),
  ('Pre-Nursing (Prerequisites only for application to Nursing School)','8-week','UG',NULL,280),
  ('Psychology, Bachelor of Arts','8-week','UG','BA',290),
  ('Public Relations & Strategic Communication Management, Bachelor of Arts','8-week','UG','BA',300),
  ('Religious Studies, Bachelor of Arts','8-week','UG','BA',310),
  ('Renewable Energy, Bachelor of Applied Arts & Sciences (Associate of Applied Science in Renewable Energy Technology Required)','8-week','UG','BAAS',320),
  ('Renewable Energy, Bachelor of Science','8-week','UG','BS',330),
  ('Sociology, Bachelor of Arts','8-week','UG','BA',340),
  ('TTU Online Undeclared','8-week','UG',NULL,350),
  ('Writing, Design, & Technical Communication, Bachelor of Arts','8-week','UG','BA',360)
ON CONFLICT (label, modality) DO NOTHING;

-- Projection v2: stitch the student's SF application state onto each linked
-- contact — status, checklist progress, last SF change. The generated columns.
ALTER TABLE portal_contact_projection ADD COLUMN IF NOT EXISTS sf_app_id text;
ALTER TABLE portal_contact_projection ADD COLUMN IF NOT EXISTS sf_app_status text;
ALTER TABLE portal_contact_projection ADD COLUMN IF NOT EXISTS sf_app_stage text;
ALTER TABLE portal_contact_projection ADD COLUMN IF NOT EXISTS sf_decision text;
ALTER TABLE portal_contact_projection ADD COLUMN IF NOT EXISTS sf_decision_display text;
ALTER TABLE portal_contact_projection ADD COLUMN IF NOT EXISTS sf_checklist_done int NOT NULL DEFAULT 0;
ALTER TABLE portal_contact_projection ADD COLUMN IF NOT EXISTS sf_checklist_total int NOT NULL DEFAULT 0;
ALTER TABLE portal_contact_projection ADD COLUMN IF NOT EXISTS sf_open_items int;
ALTER TABLE portal_contact_projection ADD COLUMN IF NOT EXISTS sf_pct numeric;
ALTER TABLE portal_contact_projection ADD COLUMN IF NOT EXISTS sf_app_submitted_at timestamptz;
ALTER TABLE portal_contact_projection ADD COLUMN IF NOT EXISTS sf_status_change_at timestamptz;
ALTER TABLE portal_contact_projection ADD COLUMN IF NOT EXISTS docs_pending int NOT NULL DEFAULT 0;

ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

DROP VIEW IF EXISTS sf_contact_portal;
CREATE VIEW sf_contact_portal AS
SELECT c.*, p.portal_user_id, p.link_status AS portal_link_status,
       p.portal_app_id, p.portal_app_status, p.portal_app_status_at,
       p.portal_app_program, p.portal_app_term, p.portal_app_submitted_at,
       p.portal_app_history, p.checklist_done, p.checklist_total,
       p.last_portal_activity_at,
       p.sf_app_id, p.sf_app_status, p.sf_app_stage, p.sf_decision,
       p.sf_decision_display, p.sf_checklist_done, p.sf_checklist_total,
       p.sf_open_items, p.sf_pct, p.sf_app_submitted_at, p.sf_status_change_at,
       p.docs_pending
FROM sf_contact c LEFT JOIN portal_contact_projection p ON p.sf_contact_id = c.id;

-- Item reminders: a student commits to a date for one open requirement;
-- the sync loop's tick sends an SMS that day (implementation-intention nudge).
CREATE TABLE IF NOT EXISTS portal_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  item_ref text NOT NULL,               -- sf checklist item id or local item id
  label text NOT NULL,
  send_on date NOT NULL,
  sent_at timestamptz,
  canceled_at timestamptz,
  result text,                          -- sent | no_phone | no_twilio | error
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_reminders_due ON portal_reminders (send_on) WHERE sent_at IS NULL AND canceled_at IS NULL;
