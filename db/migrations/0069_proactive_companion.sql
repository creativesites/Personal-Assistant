-- Advisor Companion Plan Phase 4.5 — Proactive Companion Crons (see
-- docs/ADVISOR_COMPANION_PLAN.md §4.7/§4.8/§9). Two new queues the four
-- proactive companion crons (gossip, interest, spiritual, motivational)
-- write to, plus the `initiated` flag on advisor_messages that lets a
-- frontend tell a proactively-sent Advisor message apart from a reply.

CREATE TABLE IF NOT EXISTS proactive_interest_chats (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id     UUID REFERENCES advisor_sessions(id) ON DELETE SET NULL,
  interest_topic VARCHAR(255) NOT NULL,
  trigger_event  TEXT,
  content_type   VARCHAR(50) NOT NULL,  -- 'sports_score' | 'meme' | 'news_article' | 'stock_alert' | 'devotional' | 'motivational'
  delivered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_engaged   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proactive_interest_chats_user ON proactive_interest_chats(user_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_interest_chats_dedup ON proactive_interest_chats(user_id, content_type, delivered_at DESC);

CREATE TABLE IF NOT EXISTS gossip_worthy_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  signal_type     VARCHAR(30) NOT NULL,  -- 'tone_shift' | 'ghosting' | 'sudden_interest' | 'life_event' | 'reciprocity_drop'
  summary         TEXT NOT NULL,
  confidence      DECIMAL(4,3) NOT NULL DEFAULT 0.5,
  in_close_circle BOOLEAN NOT NULL DEFAULT FALSE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'dismissed', 'expired')),
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gossip_worthy_events_pending ON gossip_worthy_events(user_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_gossip_worthy_events_contact_signal ON gossip_worthy_events(user_id, contact_id, signal_type, created_at DESC);

ALTER TABLE advisor_messages ADD COLUMN IF NOT EXISTS initiated BOOLEAN NOT NULL DEFAULT FALSE;
