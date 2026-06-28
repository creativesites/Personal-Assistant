-- Add trial_ends_at to track free pro trial period
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Backfill existing free users: treat them as having no trial (trial_ends_at stays NULL)
-- New users will get plan='pro', status='trialing', trial_ends_at=NOW()+30 days
