-- Extend event_type enum with calendar-UI values missing from the original definition.
-- ALTER TYPE ... ADD VALUE is non-transactional in Postgres but IF NOT EXISTS makes it idempotent.
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'meeting';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'follow_up';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'reminder';
