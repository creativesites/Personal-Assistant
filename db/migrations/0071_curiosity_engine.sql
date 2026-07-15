-- Zuri Curiosity Layer — a cross-cutting engine that notices gaps in
-- what Zuri knows (about a contact, or about the user themselves) and
-- asks about them, either woven naturally into a normal Advisor turn or
-- delivered proactively out of the blue. See CLAUDE.md "Curiosity Layer"
-- for the full design.

CREATE TABLE IF NOT EXISTS advisor_curiosity_prompts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id        UUID REFERENCES advisor_sessions(id) ON DELETE SET NULL,
  target_type       VARCHAR(20) NOT NULL CHECK (target_type IN ('contact', 'user')),
  target_contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  gap_type          VARCHAR(30) NOT NULL CHECK (gap_type IN (
                       'job_title', 'company', 'relationship_type', 'interests', 'motivational_style'
                     )),
  question_text     TEXT NOT NULL,
  delivery          VARCHAR(20) NOT NULL DEFAULT 'inline' CHECK (delivery IN ('inline', 'proactive')),
  status            VARCHAR(20) NOT NULL DEFAULT 'asked' CHECK (status IN ('asked', 'answered', 'expired')),
  answer_value      TEXT,
  asked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pending-answer lookup: "was the user's last message answering something we recently asked?"
CREATE INDEX IF NOT EXISTS idx_advisor_curiosity_prompts_pending
  ON advisor_curiosity_prompts(user_id, status, asked_at DESC) WHERE status = 'asked';

-- Cooldown lookup: "have we asked about this exact gap recently?"
CREATE INDEX IF NOT EXISTS idx_advisor_curiosity_prompts_cooldown
  ON advisor_curiosity_prompts(user_id, target_type, target_contact_id, gap_type, asked_at DESC);
