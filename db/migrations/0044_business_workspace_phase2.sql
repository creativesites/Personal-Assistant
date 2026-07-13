-- Zuri Business Workspace Phase 2 — AI Generation + Document Memory.
-- See docs/BUSINESS_WORKSPACE_PLAN.md §7/§15.
--
-- AI Document Memory reuses contact_insights rather than a parallel
-- "document memory" table — this is the one column that makes that
-- possible: a document-derived insight (decision maker, budget, concern,
-- competitor mentioned) is an ordinary contact_insights row, just with
-- source='document' and this FK set, so every existing consumer of
-- contact_insights already picks it up.

ALTER TABLE contact_insights ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contact_insights_source_document ON contact_insights(source_document_id) WHERE source_document_id IS NOT NULL;
