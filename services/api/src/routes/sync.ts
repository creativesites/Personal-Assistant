/**
 * Device sync: a change feed so a phone can mirror the WhatsApp inbox.
 * Contract: docs/SYNC_FEED.md.
 *
 *   GET /api/sync/state                              → head cursor + counts
 *   GET /api/sync/changes?cursor=&limit=             → ordered changes after cursor
 *   GET /api/sync/conversations/:id/messages?before= → older history, newest page first
 *
 * Every insert/update of a contact, conversation or message (and a reaction,
 * which re-publishes its message) takes the next change_seq; deletes leave a
 * tombstone (migration 0137). Writes commit in change_seq order, so a cursor
 * never skips anything. None of these endpoints has side effects (no
 * mark-as-read), unlike the web inbox's message GET.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { getEffectiveScope } from '../lib/org-scope';
import { avatarTag } from './sync-avatars';

const FAILED_TRANSCRIPT = '[Audio voice message]';
const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker']);

// ── cursors ─────────────────────────────────────────────────────────────────

const encodeCursor = (seq: string | number) => `c1.${seq}`;
function decodeCursor(c: string | undefined): string {
  if (!c) return '0';
  const m = /^c1\.(\d{1,19})$/.exec(c);
  if (!m) throw Object.assign(new Error('Invalid cursor'), { statusCode: 400 });
  return m[1];
}
// History page cursor: the oldest message already held (timestamp in
// microseconds, since Zuri-sent rows carry sub-second times, + arrival order).
const encodeBefore = (tsUs: string, order: string) => `b1.${tsUs}.${order}`;
function decodeBefore(c: string | undefined): { tsUs: string; order: string } | null {
  if (!c) return null;
  const m = /^b1\.(\d{1,17})\.(\d{1,19})$/.exec(c);
  if (!m) throw Object.assign(new Error('Invalid before cursor'), { statusCode: 400 });
  return { tsUs: m[1], order: m[2] };
}
/** Exact ISO timestamp (microsecond precision) from epoch microseconds. */
function usToIso(us: string): string {
  const n = BigInt(us);
  const sec = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, '0');
  return new Date(Number(sec) * 1000).toISOString().replace(/\.\d{3}Z$/, `.${frac}Z`);
}

// ── message shape ───────────────────────────────────────────────────────────

export const MESSAGE_SELECT = `
  SELECT m.id, m.conversation_id, m.whatsapp_message_id, m.sender_type, m.message_type::text AS message_type,
         m.body, m.transcription, m.whatsapp_timestamp, m.ingest_seq, m.change_seq,
         (extract(epoch FROM m.whatsapp_timestamp) * 1000000)::bigint AS ts_us,
         m.delivery_status, m.is_deleted, m.edited_at, m.is_forwarded, m.is_starred, m.is_pinned,
         m.is_ai_generated, m.sender_display_name, m.sender_jid,
         m.media_url IS NOT NULL OR m.media_meta IS NOT NULL AS media_available,
         m.media_mime_type, m.media_info,
         (m.deleted_for_user_ids IS NOT NULL AND $1::uuid = ANY(m.deleted_for_user_ids)) AS hidden,
         m.quoted_wa_message_id, m.quoted_snapshot,
         q.id AS q_id, q.whatsapp_message_id AS q_wa_id, q.sender_type AS q_sender, q.message_type::text AS q_type,
         q.body AS q_body, q.is_deleted AS q_deleted, q.sender_display_name AS q_name,
         COALESCE((
           SELECT json_agg(json_build_object(
             'emoji', r.emoji, 'fromMe', r.from_me, 'reactorJid', r.reactor_jid,
             'at', (extract(epoch FROM COALESCE(r.reacted_at, r.created_at)) * 1000)::bigint
           ) ORDER BY COALESCE(r.reacted_at, r.created_at))
           FROM message_reactions r WHERE r.message_id = m.id
         ), '[]'::json) AS reactions
  FROM messages m
  LEFT JOIN messages q ON q.id = COALESCE(m.quoted_message_id, (
    SELECT q2.id FROM messages q2
    WHERE m.quoted_message_id IS NULL AND m.quoted_wa_message_id IS NOT NULL
      AND q2.conversation_id = m.conversation_id AND q2.whatsapp_message_id = m.quoted_wa_message_id
    LIMIT 1))`;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function parseLocation(body: string | null) {
  if (!body) return null;
  try {
    const v = JSON.parse(body);
    return typeof v?.lat === 'number' ? { lat: v.lat, lng: v.lng, name: v.name ?? null, address: v.address ?? null } : null;
  } catch {
    return null;
  }
}

export function messageShape(r: Row) {
  const type: string = r.message_type;
  const deleted = Boolean(r.is_deleted);
  const info = (r.media_info ?? {}) as Row;
  const isMedia = MEDIA_TYPES.has(type);
  const snap = (r.quoted_snapshot ?? null) as Row | null;
  const quotedWa = r.q_wa_id ?? r.quoted_wa_message_id ?? snap?.waMessageId ?? null;
  const transcription = r.transcription && r.transcription !== FAILED_TRANSCRIPT ? r.transcription : null;
  return {
    id: r.id,
    conversationId: r.conversation_id,
    waMessageId: r.whatsapp_message_id,
    fromMe: r.sender_type === 'user',
    sender: r.sender_jid || r.sender_display_name ? { jid: r.sender_jid ?? null, name: r.sender_display_name ?? null } : null,
    type,
    text: deleted ? null : type === 'location' ? null : (r.body ?? null),
    transcription: deleted ? null : transcription,
    timestamp: new Date(r.whatsapp_timestamp).getTime(),
    order: String(r.ingest_seq),
    seq: String(r.change_seq),     // last change applied to this row
    status: r.sender_type === 'user' ? (r.delivery_status ?? 'sent') : null,
    deleted,
    editedAt: r.edited_at ? new Date(r.edited_at).getTime() : null,
    forwarded: Boolean(r.is_forwarded),
    starred: Boolean(r.is_starred),
    pinned: Boolean(r.is_pinned),
    aiGenerated: Boolean(r.is_ai_generated),
    quoted: quotedWa
      ? {
          messageId: r.q_id ?? null,
          waMessageId: quotedWa,
          fromMe: r.q_id ? r.q_sender === 'user' : (snap?.fromMe ?? null),
          senderName: r.q_id ? (r.q_name ?? null) : null,
          type: r.q_id ? r.q_type : (snap?.type ?? 'text'),
          text: r.q_id ? (r.q_deleted ? null : (r.q_body ?? null)) : (snap?.text ?? null),
          deleted: r.q_id ? Boolean(r.q_deleted) : false,
        }
      : null,
    media: isMedia && !deleted
      ? {
          kind: info.kind ?? type,
          mime: info.mime ?? r.media_mime_type ?? null,
          size: info.size ?? null,
          width: info.width ?? null,
          height: info.height ?? null,
          seconds: info.seconds ?? null,
          voiceNote: Boolean(info.ptt) || (type === 'audio' && !info.kind),
          roundVideo: Boolean(info.ptv),
          gif: Boolean(info.gif),
          animated: Boolean(info.animated),
          fileName: info.fileName ?? (type === 'document' ? (r.body ?? null) : null),
          pageCount: info.pageCount ?? null,
          thumbnail: info.thumb ?? null,
          available: Boolean(r.media_available),
          path: `/api/messages/${r.id}/media`,
        }
      : null,
    location: type === 'location' && !deleted ? parseLocation(r.body) : null,
    reactions: r.reactions ?? [],
  };
}

function conversationShape(r: Row) {
  return {
    id: r.id,
    contactId: r.contact_id,
    chatJid: r.whatsapp_chat_id,
    lastMessageAt: r.last_message_at ? new Date(r.last_message_at).getTime() : null,
    preview: r.last_message_preview ?? null,
    unreadCount: r.unread_count ?? 0,
    archived: Boolean(r.is_archived),
    muted: Boolean(r.is_muted),
    pinned: Boolean(r.is_pinned),
    pinnedAt: r.pinned_at ? new Date(r.pinned_at).getTime() : null,
  };
}

function contactShape(r: Row) {
  return {
    id: r.id,
    jid: r.whatsapp_jid,
    phone: r.phone_number ?? null,
    name: r.custom_name || r.display_name || null,
    savedName: r.custom_name ?? null,
    pushName: r.display_name ?? null,
    isGroup: Boolean(r.is_group),
    isBusiness: Boolean(r.is_business),
    hasAvatar: Boolean(r.avatar_url),
    // Changes whenever the picture does; matches the avatar endpoint's ETag.
    avatarTag: r.avatar_url ? avatarTag(r.avatar_url) : null,
    lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).getTime() : null,
  };
}

// ── routes ──────────────────────────────────────────────────────────────────

const changesQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
const pageQuery = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function syncRoutes(fastify: FastifyInstance) {
  const owner = async (userId: string) => (await getEffectiveScope(userId)).ownerUserId;

  fastify.get('/api/sync/state', { preHandler: authenticate }, async (request) => {
    const { userId } = request.user as { userId: string };
    const uid = await owner(userId);
    const { rows: [r] } = await db.query(
      `SELECT GREATEST(
                COALESCE((SELECT MAX(change_seq) FROM messages WHERE user_id = $1), 0),
                COALESCE((SELECT MAX(change_seq) FROM conversations WHERE user_id = $1), 0),
                COALESCE((SELECT MAX(change_seq) FROM contacts WHERE user_id = $1), 0),
                COALESCE((SELECT MAX(change_seq) FROM sync_tombstones WHERE user_id = $1), 0)) AS head,
              (SELECT COUNT(*) FROM conversations WHERE user_id = $1)::int AS conversations,
              (SELECT COUNT(*) FROM messages WHERE user_id = $1)::int AS messages,
              (SELECT COUNT(*) FROM contacts WHERE user_id = $1 AND merged_into_id IS NULL)::int AS contacts`,
      [uid],
    );
    return {
      head: encodeCursor(r.head),
      serverTime: Date.now(),
      counts: { conversations: r.conversations, messages: r.messages, contacts: r.contacts },
    };
  });

  fastify.get('/api/sync/changes', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const uid = await owner(userId);
    const { cursor, limit } = changesQuery.parse(request.query);
    let after: string;
    try {
      after = decodeCursor(cursor);
    } catch {
      return reply.code(400).send({ error: 'Invalid cursor' });
    }

    // Each source is read up to `limit` rows past the cursor; the merged first
    // `limit` are exactly the next `limit` changes overall.
    const [contacts, conversations, messages, tombstones] = await Promise.all([
      db.query(
        `SELECT * FROM contacts WHERE user_id = $1 AND change_seq > $2 ORDER BY change_seq LIMIT $3`,
        [uid, after, limit],
      ),
      db.query(
        `SELECT * FROM conversations WHERE user_id = $1 AND change_seq > $2 ORDER BY change_seq LIMIT $3`,
        [uid, after, limit],
      ),
      db.query(
        `${MESSAGE_SELECT}
         WHERE m.user_id = $1 AND m.change_seq > $2 ORDER BY m.change_seq LIMIT $3`,
        [uid, after, limit],
      ),
      db.query(
        `SELECT change_seq, entity, entity_id FROM sync_tombstones
         WHERE user_id = $1 AND change_seq > $2 ORDER BY change_seq LIMIT $3`,
        [uid, after, limit],
      ),
    ]);

    type Change = { seq: bigint; entity: string; op: 'upsert' | 'delete'; id: string; data?: unknown };
    const all: Change[] = [
      ...contacts.rows.map((r): Change => (r.merged_into_id
        ? { seq: BigInt(r.change_seq), entity: 'contact', op: 'delete', id: r.id, data: { mergedInto: r.merged_into_id } }
        : { seq: BigInt(r.change_seq), entity: 'contact', op: 'upsert', id: r.id, data: contactShape(r) })),
      ...conversations.rows.map((r): Change => ({
        seq: BigInt(r.change_seq), entity: 'conversation', op: 'upsert', id: r.id, data: conversationShape(r),
      })),
      ...messages.rows.map((r): Change => (r.hidden
        // "Delete for me": gone from this account's view.
        ? { seq: BigInt(r.change_seq), entity: 'message', op: 'delete', id: r.id }
        : { seq: BigInt(r.change_seq), entity: 'message', op: 'upsert', id: r.id, data: messageShape(r) })),
      ...tombstones.rows.map((r): Change => ({
        seq: BigInt(r.change_seq), entity: r.entity, op: 'delete', id: r.entity_id,
      })),
    ].sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0));

    const page = all.slice(0, limit);
    const last = page.length ? page[page.length - 1].seq.toString() : after;
    return {
      changes: page.map((c) => ({ ...c, seq: c.seq.toString() })),
      cursor: encodeCursor(last),
      hasMore: all.length > limit
        || [contacts, conversations, messages, tombstones].some((r) => r.rows.length === limit),
    };
  });

  fastify.get('/api/sync/conversations/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const uid = await owner(userId);
    const { before, limit } = pageQuery.parse(request.query);
    let b: ReturnType<typeof decodeBefore>;
    try {
      b = decodeBefore(before);
    } catch {
      return reply.code(400).send({ error: 'Invalid before cursor' });
    }
    const { rows: [conv] } = await db.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [id, uid],
    );
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

    const { rows } = await db.query(
      `${MESSAGE_SELECT}
       WHERE m.conversation_id = $2
         AND ($3::timestamptz IS NULL OR (m.whatsapp_timestamp, m.ingest_seq) < ($3::timestamptz, $4::bigint))
         AND NOT (m.deleted_for_user_ids IS NOT NULL AND $1::uuid = ANY(m.deleted_for_user_ids))
       ORDER BY m.whatsapp_timestamp DESC, m.ingest_seq DESC
       LIMIT $5`,
      [uid, id, b ? usToIso(b.tsUs) : null, b?.order ?? '0', limit + 1],
    );
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse(); // display order: oldest first
    const oldest = page[0];
    return {
      messages: page.map(messageShape),
      before: hasMore && oldest ? encodeBefore(String(oldest.ts_us), String(oldest.ingest_seq)) : null,
      hasMore,
    };
  });
}
