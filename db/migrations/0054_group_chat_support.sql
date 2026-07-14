-- Group chat support (see CLAUDE.md "Groups" work).
-- contacts.is_group already exists (0003_contacts.sql) and is set correctly at
-- ingestion time from the WhatsApp JID suffix (@g.us). What's been missing is
-- per-message sender identity within a group — every message from every
-- participant currently attributes to the single group "contact" row, with
-- no way to show who actually sent a given message. These columns let the
-- WhatsApp service record the sending participant's WhatsApp push name and
-- JID per message, for display only — no per-participant contact rows yet
-- (that's out of scope for now; see the dead `contact_group_members` table
-- from 0003 for that future work).

ALTER TABLE messages
  ADD COLUMN sender_display_name VARCHAR(255),
  ADD COLUMN sender_jid VARCHAR(255);

COMMENT ON COLUMN messages.sender_display_name IS 'Group chats only: WhatsApp push name of the participant who sent this message. NULL for 1:1 chats and for messages sent by the connected account.';
COMMENT ON COLUMN messages.sender_jid IS 'Group chats only: WhatsApp JID of the participant who sent this message. NULL for 1:1 chats and for messages sent by the connected account.';
