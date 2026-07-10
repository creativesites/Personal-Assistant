-- Zuri Marketing Phase 3 — Funnel Tracking. See docs/ZURI_MARKETING_EXPANSION.md §9/§12.5.
--
-- There is no live click-tracking (no real Meta app, no per-post trackable
-- links — see migration 0033's header comment on the same limitation for
-- publishing), so a contact can't be attributed to a post automatically.
-- These columns exist so a human can record "this WhatsApp lead came from
-- that Facebook post" — the honest MVP for attribution given what's real
-- today — and Analytics can aggregate on it.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS source_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_social_post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_source_post ON contacts(source_social_post_id) WHERE source_social_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_source_product ON contacts(source_product_id) WHERE source_product_id IS NOT NULL;
