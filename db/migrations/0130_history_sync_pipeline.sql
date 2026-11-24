-- History Sync Phase 1 — one coordinated import pipeline per user
-- (services/whatsapp/src/lib/history-sync-pipeline.ts).
--
-- sync_jobs gains the fields the importer reports while WhatsApp streams
-- history batches after a link: where the job came from, WhatsApp's own
-- progress %, how many batches arrived, and how many chats were queued for
-- AI analysis once the import settled. sync_phase (0025) now cycles
-- importing -> analysing -> complete.
ALTER TABLE sync_jobs
  ADD COLUMN IF NOT EXISTS source            TEXT     NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS wa_progress       SMALLINT,
  ADD COLUMN IF NOT EXISTS batches_received  INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analysis_queued   INTEGER  NOT NULL DEFAULT 0;

-- WhatsApp's LID addressing: the same person can appear as
-- <number>@s.whatsapp.net and as an opaque <id>@lid. History sync tells us
-- the pairing (chat.lidJid / contact.lid); persisting it lets both the
-- importer and live messages map @lid JIDs onto the phone-number JID so one
-- person is one contact and one conversation.
CREATE TABLE IF NOT EXISTS whatsapp_lid_map (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lid_jid    VARCHAR(255) NOT NULL,
  pn_jid     VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lid_jid)
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_lid_map_pn ON whatsapp_lid_map (user_id, pn_jid);
