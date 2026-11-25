-- Zuri panel "Person" tab: a fact the user marks as wrong stays wrong.
-- The profiler rebuilds a contact's insights from scratch each run; it now
-- skips anything matching a rejected fact and never retires user-added
-- facts (insight_key = 'remember').
ALTER TABLE contact_insights ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_contact_insights_rejected
  ON contact_insights (contact_id, user_id) WHERE rejected_at IS NOT NULL;
