-- History sync job tracking
CREATE TABLE IF NOT EXISTS sync_jobs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','running','completed','failed','cancelled')),
  total_conversations     INTEGER NOT NULL DEFAULT 0,
  processed_conversations INTEGER NOT NULL DEFAULT 0,
  total_messages          INTEGER NOT NULL DEFAULT 0,
  processed_messages      INTEGER NOT NULL DEFAULT 0,
  contacts_created        INTEGER NOT NULL DEFAULT 0,
  leads_generated         INTEGER NOT NULL DEFAULT 0,
  insights_extracted      INTEGER NOT NULL DEFAULT 0,
  current_chat_name       TEXT,
  error_message           TEXT,
  started_at              TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sync_jobs_user_id_idx ON sync_jobs (user_id);
CREATE INDEX IF NOT EXISTS sync_jobs_status_idx  ON sync_jobs (status);

-- Auto-response settings (one row per user)
CREATE TABLE IF NOT EXISTS auto_response_settings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  enabled                  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Business hours
  business_hours_start     TIME NOT NULL DEFAULT '09:00',
  business_hours_end       TIME NOT NULL DEFAULT '18:00',
  timezone                 TEXT NOT NULL DEFAULT 'UTC',
  active_days              INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
  -- Timing
  send_delay_seconds       INTEGER NOT NULL DEFAULT 30,
  -- Approval
  approval_mode            TEXT NOT NULL DEFAULT 'preview'
                             CHECK (approval_mode IN ('auto','preview','manual')),
  -- Conversation types to respond to
  respond_to_leads         BOOLEAN NOT NULL DEFAULT TRUE,
  respond_to_customers     BOOLEAN NOT NULL DEFAULT TRUE,
  respond_to_new_contacts  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Exceptions
  skip_groups              BOOLEAN NOT NULL DEFAULT TRUE,
  skip_broadcasts          BOOLEAN NOT NULL DEFAULT TRUE,
  -- Escalation
  escalation_keywords      TEXT[] NOT NULL DEFAULT '{}',
  escalation_notify_email  TEXT,
  -- Messages
  greeting_message         TEXT,
  away_message             TEXT,
  -- Learning
  smart_followup_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  learn_from_corrections   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
