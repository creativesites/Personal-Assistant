-- Migration 0116: WhatsApp Disconnection Alerts & Tracking
-- Tracks when a session disconnects and whether an alert email was sent.

ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ;
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS disconnect_alert_sent_at TIMESTAMPTZ;

-- Index to optimize disconnect checker queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_disconnect_alert 
  ON whatsapp_instances(status, disconnected_at, disconnect_alert_sent_at) 
  WHERE status IN ('disconnected', 'error', 'logged_out') AND disconnect_alert_sent_at IS NULL;
