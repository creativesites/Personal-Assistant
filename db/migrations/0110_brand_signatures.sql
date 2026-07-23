-- Migration 0110: Brand Signatures for Document E-Signatures

CREATE TABLE IF NOT EXISTS brand_signatures (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_profile_id UUID REFERENCES business_profiles(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL DEFAULT 'Default Signature',
  signer_name         VARCHAR(255) NOT NULL,
  signer_title        VARCHAR(255),
  signature_data      TEXT NOT NULL,
  is_default          BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_signatures_user ON brand_signatures(user_id, is_default);
CREATE INDEX IF NOT EXISTS idx_brand_signatures_profile ON brand_signatures(business_profile_id);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS signature_id UUID REFERENCES brand_signatures(id) ON DELETE SET NULL;
