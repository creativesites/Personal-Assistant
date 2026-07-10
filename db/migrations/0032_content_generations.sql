-- Zuri Marketing Phase 1 — AI Content Generator. See docs/ZURI_MARKETING_EXPANSION.md §10.
--
-- Audit trail of AI-generated marketing copy per product, mirroring the
-- provenance discipline already used for business_facts/contact_insights:
-- every row records exactly what was fed to the model and which model
-- produced the output, so a bad generation can be traced and regenerated.
CREATE TABLE IF NOT EXISTS content_generations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  content_type   VARCHAR(20) NOT NULL
                   CHECK (content_type IN ('description', 'caption', 'video_script')),
  input_snapshot JSONB NOT NULL DEFAULT '{}',
  output         TEXT NOT NULL,
  model          VARCHAR(100) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_generations_product ON content_generations(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_generations_user ON content_generations(user_id, created_at DESC);
