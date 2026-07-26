-- Migration 0127: Knowledge Hub Enhancements
-- Adds is_active toggle to kb_documents

ALTER TABLE kb_documents
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_kb_documents_is_active ON kb_documents(user_id, is_active);
