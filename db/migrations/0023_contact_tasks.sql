-- Contact tasks — manual + AI-generated to-dos per contact

CREATE TABLE IF NOT EXISTS contact_tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id  UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  due_date    DATE,
  completed_at TIMESTAMPTZ,
  created_by  VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'ai')),
  sort_order  SMALLINT    NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_tasks_contact ON contact_tasks(contact_id, user_id) WHERE completed_at IS NULL;

-- Important context pins — short facts injected into every AI prompt for this contact

CREATE TABLE IF NOT EXISTS contact_context_pins (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id  UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  sort_order  SMALLINT    NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_context_pins_contact ON contact_context_pins(contact_id, user_id, content);
