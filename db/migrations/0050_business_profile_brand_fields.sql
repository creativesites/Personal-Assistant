-- Migration 0050: Extend business_profiles with brand identity fields
-- Adds tagline, industry, brand_voice, company_values for the Studio Brand Hub.
-- Also adds logo_url (TEXT) to store Supabase public URLs alongside the legacy
-- local file path (logo_storage_path).

ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS tagline          TEXT;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS industry         VARCHAR(100);
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS brand_voice      TEXT;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS company_values   TEXT;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS logo_url         TEXT;
