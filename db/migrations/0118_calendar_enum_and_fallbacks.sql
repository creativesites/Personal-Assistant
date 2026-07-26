-- 0118_calendar_enum_and_fallbacks.sql
-- Add missing event_type ENUM values for meetings, follow-ups, and reminders

ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'meeting';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'follow_up';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'reminder';
