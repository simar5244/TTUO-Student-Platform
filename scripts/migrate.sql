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
