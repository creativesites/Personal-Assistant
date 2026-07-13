-- Business Workspace Phase 4 (docs/BUSINESS_WORKSPACE_PLAN.md §15) — semantic
-- search, view tracking, pricing benchmarks, Automatic Business Packs.
-- documents.embedding already exists (migration 0043); this migration adds
-- the columns/tables needed for the remaining Phase 4 pieces.

-- View tracking (roadmap §15 Phase 4). Documents go out as WhatsApp file
-- attachments today, which give no "the customer opened it" signal — a
-- share_token lets Zuri send a link alongside the file and record an actual
-- view via an unauthenticated, token-scoped route (never the numeric id,
-- which is more likely to leak into logs/UI than a dedicated token).
ALTER TABLE documents ADD COLUMN IF NOT EXISTS share_token UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE documents ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_share_token ON documents(share_token);

-- Pricing benchmarks (plan §9) — reuses business_facts, just widens the
-- category/source vocabularies rather than forking a new pricing table.
ALTER TABLE business_facts DROP CONSTRAINT IF EXISTS business_facts_category_check;
ALTER TABLE business_facts ADD CONSTRAINT business_facts_category_check CHECK (category IN (
  'product', 'pricing', 'shipping', 'refund_policy', 'faq',
  'hours', 'inventory', 'promotion', 'supplier', 'tax',
  'bank_details', 'wa_template', 'brand_voice', 'objection', 'other',
  'pricing_benchmark'
));
ALTER TABLE business_facts DROP CONSTRAINT IF EXISTS business_facts_source_check;
ALTER TABLE business_facts ADD CONSTRAINT business_facts_source_check CHECK (source IN (
  'ai_inference', 'manual', 'document', 'imported', 'aggregation'
));

-- Automatic Business Packs (plan §3/§13) — pack *definitions* are code
-- constants; this just records which documents got generated together.
CREATE TABLE IF NOT EXISTS document_pack_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id   UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  pack_key     VARCHAR(50) NOT NULL,
  document_ids JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_document_pack_runs_user ON document_pack_runs(user_id, created_at DESC);
