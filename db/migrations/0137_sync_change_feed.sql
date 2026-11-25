-- Migration 0137: change feed for device sync (mobile plan G3, messaging slice).
--
-- Every insert/update of a synced row takes the next value of one global
-- sequence (change_seq). A device keeps the last change_seq it applied and
-- asks for everything after it.
--
-- Sequence numbers are handed out before commit, so across two concurrent
-- transactions a higher number could become visible before a lower one and a
-- device would skip the lower one forever. To prevent that, every write
-- statement on a synced table first takes one transaction-scoped advisory
-- lock (statement-level trigger, so before any row lock: no lock-order
-- deadlocks). Numbered writes therefore commit in number order and a reader
-- always sees a gap-free prefix.
-- Cost: writes to these four tables run one transaction at a time. They are
-- mostly single autocommit statements (ms); a 500-row history chunk holds it
-- ~1s. Revisit (logical replication / per-user ordering) if write volume grows.
--
-- messages also get an immutable ingest_seq: WhatsApp timestamps are whole
-- seconds, so (whatsapp_timestamp, ingest_seq) is the display order.
-- Deletes leave a row in sync_tombstones.

CREATE SEQUENCE IF NOT EXISTS sync_change_seq;

-- ── messages ────────────────────────────────────────────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS ingest_seq BIGINT,
  ADD COLUMN IF NOT EXISTS change_seq BIGINT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  -- WhatsApp id of the quoted message, kept even when that message isn't stored,
  -- plus a snapshot (sender, type, text) so a reply always renders its quote.
  ADD COLUMN IF NOT EXISTS quoted_wa_message_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS quoted_snapshot JSONB,
  -- Device-safe media facts: kind, mime, size, width/height, seconds, ptt,
  -- file name, page count, small JPEG thumbnail. Never the media key.
  ADD COLUMN IF NOT EXISTS media_info JSONB;

-- Backfill: owner, display order (timestamp, then arrival), change numbers.
WITH ordered AS (
  SELECT m.id, c.user_id,
         row_number() OVER (ORDER BY m.whatsapp_timestamp, m.created_at, m.id) AS rn
  FROM messages m JOIN conversations c ON c.id = m.conversation_id
  WHERE m.ingest_seq IS NULL
), base AS (SELECT COALESCE((SELECT last_value FROM sync_change_seq WHERE is_called), 0) AS b)
UPDATE messages m
SET user_id = o.user_id,
    ingest_seq = base.b + o.rn,
    change_seq = base.b + o.rn,
    updated_at = COALESCE(m.updated_at, m.created_at)
FROM ordered o, base
WHERE m.id = o.id;

SELECT setval('sync_change_seq', GREATEST(COALESCE((SELECT MAX(change_seq) FROM messages), 0), 1));

UPDATE messages SET quoted_wa_message_id = q.whatsapp_message_id
FROM messages q
WHERE messages.quoted_message_id = q.id AND messages.quoted_wa_message_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_user_change ON messages (user_id, change_seq);
-- Replies whose quoted message arrives later (history comes in batches).
CREATE INDEX IF NOT EXISTS idx_messages_unlinked_quote ON messages (conversation_id, quoted_wa_message_id)
  WHERE quoted_wa_message_id IS NOT NULL AND quoted_message_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_conv_order ON messages (conversation_id, whatsapp_timestamp DESC, ingest_seq DESC);

-- ── conversations / contacts ────────────────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS change_seq BIGINT;
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS change_seq BIGINT;

UPDATE conversations SET change_seq = nextval('sync_change_seq')
WHERE change_seq IS NULL;
UPDATE contacts SET change_seq = nextval('sync_change_seq')
WHERE change_seq IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_user_change ON conversations (user_id, change_seq);
CREATE INDEX IF NOT EXISTS idx_contacts_user_change ON contacts (user_id, change_seq);

-- ── tombstones ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_tombstones (
  change_seq BIGINT PRIMARY KEY DEFAULT nextval('sync_change_seq'),
  user_id UUID NOT NULL,
  entity VARCHAR(32) NOT NULL,
  entity_id UUID NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sync_tombstones_user ON sync_tombstones (user_id, change_seq);

-- ── reactions: one per person per message, contact reactions included ───────
ALTER TABLE message_reactions
  ADD COLUMN IF NOT EXISTS from_me BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS reactor_jid VARCHAR(255),
  ADD COLUMN IF NOT EXISTS reacted_at TIMESTAMPTZ;
ALTER TABLE message_reactions DROP CONSTRAINT IF EXISTS message_reactions_message_id_user_id_emoji_key;
-- Keep the newest if the owner had stacked several emojis on one message.
DELETE FROM message_reactions r USING message_reactions newer
WHERE r.message_id = newer.message_id AND r.from_me AND newer.from_me
  AND COALESCE(r.reactor_jid, '') = COALESCE(newer.reactor_jid, '')
  AND (r.created_at, r.id) < (newer.created_at, newer.id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_reactions_reactor
  ON message_reactions (message_id, from_me, COALESCE(reactor_jid, ''));

-- ── triggers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_write_lock() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(7231001370);
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_lock ON messages;
CREATE TRIGGER trg_sync_lock BEFORE INSERT OR UPDATE OR DELETE ON messages
  FOR EACH STATEMENT EXECUTE FUNCTION sync_write_lock();
DROP TRIGGER IF EXISTS trg_sync_lock ON conversations;
CREATE TRIGGER trg_sync_lock BEFORE INSERT OR UPDATE OR DELETE ON conversations
  FOR EACH STATEMENT EXECUTE FUNCTION sync_write_lock();
DROP TRIGGER IF EXISTS trg_sync_lock ON contacts;
CREATE TRIGGER trg_sync_lock BEFORE INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH STATEMENT EXECUTE FUNCTION sync_write_lock();
DROP TRIGGER IF EXISTS trg_sync_lock ON message_reactions;
CREATE TRIGGER trg_sync_lock BEFORE INSERT OR UPDATE OR DELETE ON message_reactions
  FOR EACH STATEMENT EXECUTE FUNCTION sync_write_lock();

CREATE OR REPLACE FUNCTION sync_messages_stamp() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NULL THEN
      SELECT user_id INTO NEW.user_id FROM conversations WHERE id = NEW.conversation_id;
    END IF;
    NEW.ingest_seq := nextval('sync_change_seq');
    NEW.change_seq := NEW.ingest_seq;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
  END IF;
  -- UPDATE: only real changes advance the feed.
  NEW.ingest_seq := OLD.ingest_seq;
  NEW.user_id := COALESCE(NEW.user_id, OLD.user_id);
  IF (NEW.change_seq IS NOT DISTINCT FROM OLD.change_seq) AND (NEW IS DISTINCT FROM OLD) THEN
    NEW.change_seq := nextval('sync_change_seq');
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_messages_stamp ON messages;
CREATE TRIGGER trg_sync_messages_stamp BEFORE INSERT OR UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION sync_messages_stamp();

CREATE OR REPLACE FUNCTION sync_row_stamp() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR ((NEW.change_seq IS NOT DISTINCT FROM OLD.change_seq) AND (NEW IS DISTINCT FROM OLD)) THEN
    NEW.change_seq := nextval('sync_change_seq');
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_conversations_stamp ON conversations;
CREATE TRIGGER trg_sync_conversations_stamp BEFORE INSERT OR UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION sync_row_stamp();
DROP TRIGGER IF EXISTS trg_sync_contacts_stamp ON contacts;
CREATE TRIGGER trg_sync_contacts_stamp BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION sync_row_stamp();

CREATE OR REPLACE FUNCTION sync_tombstone() RETURNS trigger AS $$
BEGIN
  IF OLD.user_id IS NOT NULL THEN
    INSERT INTO sync_tombstones (user_id, entity, entity_id) VALUES (OLD.user_id, TG_ARGV[0], OLD.id);
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_messages_tombstone ON messages;
CREATE TRIGGER trg_sync_messages_tombstone AFTER DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone('message');
DROP TRIGGER IF EXISTS trg_sync_conversations_tombstone ON conversations;
CREATE TRIGGER trg_sync_conversations_tombstone AFTER DELETE ON conversations
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone('conversation');
DROP TRIGGER IF EXISTS trg_sync_contacts_tombstone ON contacts;
CREATE TRIGGER trg_sync_contacts_tombstone AFTER DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone('contact');

-- A reaction change re-publishes its message (reactions travel inside it).
CREATE OR REPLACE FUNCTION sync_reaction_touch() RETURNS trigger AS $$
BEGIN
  UPDATE messages SET updated_at = clock_timestamp()
  WHERE id = COALESCE(NEW.message_id, OLD.message_id);
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_reaction_touch ON message_reactions;
CREATE TRIGGER trg_sync_reaction_touch AFTER INSERT OR UPDATE OR DELETE ON message_reactions
  FOR EACH ROW EXECUTE FUNCTION sync_reaction_touch();
