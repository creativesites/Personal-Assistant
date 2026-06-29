-- 0026: Knowledge Base enhancements — add metadata, usage tracking, and tagging columns

ALTER TABLE kb_documents
  ADD COLUMN IF NOT EXISTS category    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tags        TEXT[]       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS word_count  INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS file_size_bytes INT      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used_count  INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS summary     TEXT;

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_kb_documents_category ON kb_documents (user_id, category) WHERE category IS NOT NULL;
-- Index for tag search
CREATE INDEX IF NOT EXISTS idx_kb_documents_tags ON kb_documents USING GIN (tags);
