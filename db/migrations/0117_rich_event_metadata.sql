-- 0117_rich_event_metadata.sql
-- Rich Metadata for Calendar Events and Promises

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS meeting_link TEXT,
  ADD COLUMN IF NOT EXISTS deal_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS action_items JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

ALTER TABLE contact_promises
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS deal_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS action_items JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
