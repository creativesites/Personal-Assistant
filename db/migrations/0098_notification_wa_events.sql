-- Add new enum values to notification_type
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'whatsapp_connected';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'whatsapp_disconnected';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reply_suggestion';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'proactive_reminder';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'health_score_change';
