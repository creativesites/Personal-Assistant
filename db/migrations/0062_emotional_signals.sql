-- Zuri Neural Layer Phase 1 — platform-wide Emotion Engine (see
-- docs/NEURAL_LAYER_PLAN.md §4.2/§10). Supersedes the Advisor-only
-- interaction_affect table originally sketched in
-- docs/ADVISOR_COMPANION_PLAN.md §4.6 — this table is written to by any
-- module (WhatsApp message analysis, Advisor turns, and eventually
-- CRM/Projects/Suppliers), not owned by Advisor alone.

CREATE TABLE IF NOT EXISTS emotional_signals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type        VARCHAR(30) NOT NULL,   -- 'whatsapp_message' | 'advisor_turn' | 'crm_note' | 'project_update' | 'supplier_interaction' | 'deal_activity'
  entity_id          UUID,                    -- polymorphic reference (messages.id, advisor_sessions.id, ...) — nullable for session-level signals
  contact_id         UUID REFERENCES contacts(id) ON DELETE SET NULL,
  valence            DECIMAL(4,3) NOT NULL DEFAULT 0,
  arousal            DECIMAL(4,3) NOT NULL DEFAULT 0,
  dominant_emotion   VARCHAR(20),
  emotion_vector     JSONB NOT NULL DEFAULT '{}',
  behavioral_signals JSONB NOT NULL DEFAULT '{}',  -- response_latency_ms, typing_burstiness, etc. — only populated where applicable
  memory_weight      DECIMAL(4,3) NOT NULL DEFAULT 0.5,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emotional_signals_user ON emotional_signals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emotional_signals_contact ON emotional_signals(contact_id, created_at DESC) WHERE contact_id IS NOT NULL;

-- Denormalized cache columns, same convention as products.stock /
-- relationships.health_score — recomputed from emotional_signals rather
-- than queried live on every read.
ALTER TABLE relationships ADD COLUMN IF NOT EXISTS emotional_signals_summary JSONB NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS emotional_signals_summary JSONB NOT NULL DEFAULT '{}';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS emotional_signals_summary JSONB NOT NULL DEFAULT '{}';
