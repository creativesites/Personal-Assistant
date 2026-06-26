CREATE TYPE event_type AS ENUM ('birthday', 'anniversary', 'job_change', 'life_event', 'travel', 'appointment', 'deadline', 'celebration', 'loss', 'other');
CREATE TYPE event_source AS ENUM ('message_extraction', 'user_input', 'calendar_sync');
CREATE TYPE suggestion_type AS ENUM ('check_in', 'birthday_message', 'follow_up', 'congratulate', 'condolence', 'reconnect', 'respond_to_event', 'relationship_maintenance');
CREATE TYPE proactive_status AS ENUM ('pending', 'snoozed', 'approved', 'dismissed', 'sent');

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_type event_type NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  event_date DATE,
  event_datetime TIMESTAMPTZ,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule VARCHAR(255),
  source event_source NOT NULL DEFAULT 'message_extraction',
  source_message_id UUID REFERENCES messages(id),
  confidence_score DECIMAL(5,4),
  is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE proactive_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id),
  suggestion_type suggestion_type NOT NULL,
  title VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  draft_message TEXT,
  priority SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status proactive_status NOT NULL DEFAULT 'pending',
  suggested_for_date DATE NOT NULL,
  snoozed_until DATE,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auto_reply_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  rule_name VARCHAR(255) NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}',
  persona_id UUID REFERENCES personas(id),
  response_template TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
