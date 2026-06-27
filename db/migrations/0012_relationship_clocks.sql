-- Relationship Clocks: per-relationship temporal intelligence
-- Stores learned cadence + manual configuration per contact

CREATE TABLE relationship_clocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  -- Clock type determines the firing logic
  clock_type VARCHAR(50) NOT NULL CHECK (
    clock_type IN ('dormancy_watch', 'weekly_touchpoint', 'daily_checkin', 'post_event_followup')
  ),

  -- Learned cadence statistics (updated after each interaction)
  avg_days_between_messages DECIMAL(8,2),
  std_dev_days DECIMAL(8,2),
  peak_hours JSONB DEFAULT '{}',         -- {hour_int: probability, ...}
  typical_day_of_week JSONB DEFAULT '{}', -- {weekday_int: probability, ...}

  -- Configuration (overridable by user)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_manually_configured BOOLEAN NOT NULL DEFAULT FALSE,
  check_interval_days INTEGER NOT NULL DEFAULT 7, -- min days between nudges

  -- Runtime state
  last_checked_at TIMESTAMPTZ,
  last_nudge_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,
  nudge_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_id, clock_type)
);

CREATE INDEX idx_relationship_clocks_user ON relationship_clocks (user_id);
CREATE INDEX idx_relationship_clocks_next_check ON relationship_clocks (next_check_at)
  WHERE is_active = TRUE;
