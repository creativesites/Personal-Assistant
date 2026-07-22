-- Migration 0105: Brand Studio Customization & Document Analytics Extensions

-- Extend business_profiles with visual branding and template theme fields
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS font_family          VARCHAR(50) DEFAULT 'Inter';
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS theme_template_key  VARCHAR(50) DEFAULT 'modern_minimalist';
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS watermark_text      VARCHAR(255);
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS watermark_image_url TEXT;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS header_banner_url   TEXT;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS footer_banner_url   TEXT;

-- Index document_events for fast engagement analytics queries
CREATE INDEX IF NOT EXISTS idx_document_events_type ON document_events(event_type, occurred_at DESC);
