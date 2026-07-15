import { db } from './db';
import { addToQueue } from './queue';
import { QUEUE_NAMES } from '@zuri/types';
import { getInboxConversation, publishInboxEvent } from './inbox-events';

// Advisor Companion Plan Phase 3 (docs/ADVISOR_COMPANION_PLAN.md §5.3/§9,
// "Reuse the existing WhatsApp send queue instead of creating a parallel
// sender") — extracted out of routes/conversations.ts's
// POST /api/conversations/:id/messages so advisor_action_requests'
// send_whatsapp_message execution (routes/advisor.ts) can call the exact
// same send path instead of duplicating it.

export async function sendWhatsAppMessage(userId: string, conversationId: string, text: string) {
  const { rows: [conv] } = await db.query(
    `SELECT c.id, c.whatsapp_chat_id, c.contact_id, co.whatsapp_jid
     FROM conversations c
     JOIN contacts co ON co.id = c.contact_id
     WHERE c.id = $1 AND c.user_id = $2`,
    [conversationId, userId],
  );
  if (!conv) throw new Error('Conversation not found');

  const now = new Date();
  const tempWaId = `direct-${crypto.randomUUID()}`;

  const { rows: [msg] } = await db.query(
    `INSERT INTO messages
       (conversation_id, whatsapp_message_id, sender_type, message_type, body, whatsapp_timestamp)
     VALUES ($1, $2, 'user', 'text', $3, $4)
     RETURNING id`,
    [conversationId, tempWaId, text, now],
  );

  await db.query(
    `UPDATE conversations
     SET last_message_at = $1, last_message_preview = $2, updated_at = NOW()
     WHERE id = $3`,
    [now, text.slice(0, 200), conversationId],
  );

  await addToQueue(QUEUE_NAMES.SEND_REPLY, {
    userId,
    messageId: msg.id,
    suggestedReplyId: null,
    recipientJid: conv.whatsapp_jid,
    text,
  });

  const message = {
    id: msg.id,
    senderType: 'user',
    messageType: 'text',
    body: text,
    timestamp: now.toISOString(),
    pendingSuggestions: 0,
    mediaUrl: null,
    mediaMimeType: null,
    transcription: null,
  };

  const conversation = await getInboxConversation(userId, conversationId);
  if (conversation) {
    await publishInboxEvent(userId, 'conversation:upsert', { conversation });
  }
  await publishInboxEvent(userId, 'message:new', {
    messageId: msg.id,
    conversationId,
    contactId: conv.contact_id,
    senderType: 'user',
    messageType: 'text',
    body: text,
    mediaUrl: null,
    mediaMimeType: null,
    transcription: null,
    timestamp: now.toISOString(),
  });

  return { message, conversation };
}
