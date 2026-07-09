-- Memory Engine Phase 2 — Business + Knowledge Memory. See docs/MEMORY_ENGINE_PLAN.md §4.2/§6.
--
-- Auto-learned + human-curated fact store. Competing values for the same
-- fact_key coexist as separate rows (each with its own confidence/evidence);
-- readers take the highest-confidence *approved* row per key rather than a
-- single row being force-overwritten on every contradiction — the same
-- "converges to a high-confidence fact" pattern as contact_insights, but at
-- the business level instead of per-contact.
CREATE TABLE IF NOT EXISTS business_facts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category           VARCHAR(50) NOT NULL DEFAULT 'other'
                       CHECK (category IN (
                         'product', 'pricing', 'shipping', 'refund_policy', 'faq',
                         'hours', 'inventory', 'promotion', 'supplier', 'tax',
                         'bank_details', 'wa_template', 'brand_voice', 'objection', 'other'
                       )),
  fact_key           VARCHAR(255) NOT NULL,
  fact_value         TEXT NOT NULL,
  confidence         DECIMAL(5,4) NOT NULL DEFAULT 0.5,
  evidence_count     INT NOT NULL DEFAULT 1,
  source             VARCHAR(30) NOT NULL DEFAULT 'ai_inference'
                       CHECK (source IN ('ai_inference', 'manual', 'document', 'imported')),
  source_message_ids JSONB NOT NULL DEFAULT '[]',
  is_approved        BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at        TIMESTAMPTZ,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE = human explicitly rejected this candidate
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fact_key, fact_value)
);

CREATE INDEX IF NOT EXISTS idx_business_facts_user_key ON business_facts (user_id, fact_key);
CREATE INDEX IF NOT EXISTS idx_business_facts_pending ON business_facts (user_id)
  WHERE is_approved = FALSE AND is_active = TRUE;
