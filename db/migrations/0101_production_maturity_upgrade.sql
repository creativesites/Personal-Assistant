-- Migration: 0101_production_maturity_upgrade
-- Author: Antigravity
-- Description: Database alterations for Zuri Production Maturity Upgrade (Reality Engine, Privacy, suggested reply statuses, relationship categories)

-- 1. Extend reply_status enum
ALTER TYPE reply_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE reply_status ADD VALUE IF NOT EXISTS 'used';

-- 2. Add columns to relationships
ALTER TABLE relationships
  ADD COLUMN IF NOT EXISTS relationship_category VARCHAR(50) DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS privacy_level VARCHAR(50) DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS analysis_mode VARCHAR(50) DEFAULT 'transactional';

-- 3. Add privacy_settings to contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS privacy_settings JSONB NOT NULL DEFAULT '{"analyze_messages": true, "generate_replies": true, "store_intelligence": true, "relationship_analysis": true}'::jsonb;

-- 4. Add columns to proactive_queue
ALTER TABLE proactive_queue
  ADD COLUMN IF NOT EXISTS trigger_condition JSONB,
  ADD COLUMN IF NOT EXISTS resolution_condition JSONB,
  ADD COLUMN IF NOT EXISTS relevance_score NUMERIC(3, 2),
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
