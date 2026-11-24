-- Random send delay: an auto-reply waits a random time between
-- send_delay_seconds and send_delay_max_seconds. 0 (or anything not above
-- send_delay_seconds) keeps the fixed send_delay_seconds delay.
ALTER TABLE auto_response_settings
  ADD COLUMN IF NOT EXISTS send_delay_max_seconds INTEGER NOT NULL DEFAULT 0
  CHECK (send_delay_max_seconds >= 0 AND send_delay_max_seconds <= 86400);
