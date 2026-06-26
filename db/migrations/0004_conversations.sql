CREATE TYPE message_sender AS ENUM ('user', 'contact');
CREATE TYPE message_type AS ENUM ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact_card', 'reaction', 'deleted', 'system');
CREATE TYPE sentiment_type AS ENUM ('positive', 'negative', 'neutral', 'mixed');
CREATE TYPE urgency_level AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE reply_status AS ENUM ('pending', 'approved', 'sent', 'dismissed', 'edited_and_sent');

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  whatsapp_chat_id VARCHAR(255) NOT NULL,
  last_message_at TIMESTAMPTZ,
  last_message_preview VARCHAR(500),
  unread_count INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, whatsapp_chat_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  whatsapp_message_id VARCHAR(255) NOT NULL,
  sender_type message_sender NOT NULL,
  message_type message_type NOT NULL DEFAULT 'text',
  body TEXT,
  transcription TEXT,
  media_url VARCHAR(500),
  media_mime_type VARCHAR(100),
  quoted_message_id UUID REFERENCES messages(id),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, whatsapp_message_id)
);

CREATE TABLE message_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE UNIQUE,
  sentiment sentiment_type,
  sentiment_score DECIMAL(5,4),
  emotions JSONB,
  intent JSONB,
  topics JSONB,
  entities JSONB,
  importance_score DECIMAL(5,4),
  requires_response BOOLEAN NOT NULL DEFAULT FALSE,
  response_urgency urgency_level,
  promises_detected JSONB,
  events_detected JSONB,
  embedding vector(1536),
  analysis_model VARCHAR(100),
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE suggested_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  persona_id UUID,
  suggestion_text TEXT NOT NULL,
  tone VARCHAR(100),
  reasoning TEXT,
  status reply_status NOT NULL DEFAULT 'pending',
  user_feedback VARCHAR(50),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
