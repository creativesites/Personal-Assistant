-- Migration 0117: Data Portability & Account Deletion Grace Period
-- Supports 7-day scheduled data purge and offboarding grace period

ALTER TABLE users ADD COLUMN IF NOT EXISTS scheduled_deletion_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN users.scheduled_deletion_at IS 'Timestamp when account and workspace data is scheduled for full purge (7-day grace period)';
