ALTER TABLE advisor_sessions
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_advisor_sessions_conversation_id ON advisor_sessions(conversation_id);
