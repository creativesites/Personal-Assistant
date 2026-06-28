-- CRM enrichment for the contacts module
-- Adds full CRM fields + fixes the supporting_text bug in contact_insights

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS email           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS company         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS job_title       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS industry        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS website         VARCHAR(500),
  ADD COLUMN IF NOT EXISTS notes           TEXT,
  ADD COLUMN IF NOT EXISTS customer_status VARCHAR(50)  NOT NULL DEFAULT 'contact',
  ADD COLUMN IF NOT EXISTS pipeline_stage  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS lead_score      SMALLINT     NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS source          VARCHAR(50)  NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS archived_at     TIMESTAMPTZ;

-- Fix: contact_insights was queried for supporting_text which didn't exist (caused API 500 errors)
ALTER TABLE contact_insights
  ADD COLUMN IF NOT EXISTS supporting_text TEXT;

-- Performance indexes for common CRM filter queries
CREATE INDEX IF NOT EXISTS idx_contacts_user_status    ON contacts(user_id, customer_status) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_lead_score     ON contacts(user_id, lead_score DESC)  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_company        ON contacts(user_id, company)          WHERE company IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contact_tags_contact    ON contact_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_insights_active ON contact_insights(contact_id, user_id) WHERE is_active = TRUE;
