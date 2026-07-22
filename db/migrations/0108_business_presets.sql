-- 0108_business_presets.sql
-- Add industry preset configuration to business_profiles

ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS industry_preset VARCHAR(50) NOT NULL DEFAULT 'retail_ecommerce'
  CHECK (industry_preset IN ('retail_ecommerce', 'service_agency', 'hospitality_booking', 'digital_education', 'manufacturing_craft'));

CREATE INDEX IF NOT EXISTS idx_business_profiles_preset ON business_profiles(user_id, industry_preset);
