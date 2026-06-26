CREATE TYPE advisor_role AS ENUM ('user', 'assistant', 'system');

CREATE TABLE advisor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id),
  title VARCHAR(255),
  context_summary TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE advisor_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES advisor_sessions(id) ON DELETE CASCADE,
  role advisor_role NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  token_count INTEGER,
  model_used VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
