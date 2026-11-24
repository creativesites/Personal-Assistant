-- What's needed to download a message's WhatsApp media on demand (the media
-- sub-message proto, base64, plus the message key for re-upload requests).
-- Media itself lives on the shared media volume, served by
-- GET /api/messages/:id/media.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_meta JSONB;
