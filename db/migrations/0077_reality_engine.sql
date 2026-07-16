-- Zuri Reality Engine (Phase 1) — see docs/REALITY_ENGINE_PLAN.md.
-- No new generic table: Reality Engine reuses business_events (migration
-- 0076) as its own log via new event_type values. This migration only adds
-- the one missing lifecycle terminal state proactive_queue actually needs,
-- plus the small columns Layer 1's event-driven resolution requires.

ALTER TYPE proactive_status ADD VALUE IF NOT EXISTS 'auto_resolved';

ALTER TABLE proactive_queue ADD COLUMN IF NOT EXISTS resolved_reason TEXT;
ALTER TABLE proactive_queue ADD COLUMN IF NOT EXISTS business_event_id UUID REFERENCES business_events(id) ON DELETE SET NULL;

ALTER TABLE advisor_user_profiles ADD COLUMN IF NOT EXISTS reality_engine_paused BOOLEAN NOT NULL DEFAULT FALSE;
