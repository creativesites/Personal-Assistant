/**
 * History Sync Pipeline — one coordinated import per user.
 *
 * After a link WhatsApp streams history as several `messaging-history.set`
 * batches (chats, contacts/push-names, messages, LID pairings), seconds to
 * minutes apart. Previously each batch ran its own independent loop, wrote
 * ~5 queries per message, ignored chat/contact metadata (every contact ended
 * up unnamed) and reported "completed" per batch. This pipeline:
 *
 *  1. Serialises batches per user (one promise chain) under ONE sync_jobs row.
 *  2. Writes set-based: one upsert for all contacts in a batch, one for all
 *     conversations, one INSERT … SELECT unnest(…) per 500 messages.
 *  3. Creates a conversation for every real chat WhatsApp lists (not only the
 *     ones whose messages happened to be in a batch) and names contacts from
 *     saved names / group subjects / business names / push names.
 *  4. Maps @lid JIDs onto phone-number JIDs (whatsapp_lid_map) so one person
 *     is one contact; skips newsletters and broadcast lists.
 *  5. Once batches stop arriving (settle timer), queues AI analysis for the
 *     most recent active 1:1 chats and completes the job with honest counts.
 *
 * Progress is written to sync_jobs and published on `history:progress:{userId}`
 * (relayed to the browser by the API's redis-subscriber).
 */
import type { Pool } from 'pg';
import type Redis from 'ioredis';
import type { HistoryChat, HistoryContact, HistorySetPayload, NormalisedMessage } from '../transport/types';

const MESSAGE_CHUNK = 500;
/** Quiet period after the last batch before the import is considered done. */
const SETTLE_MS = 90_000;
/** Shorter settle once WhatsApp reports 100% progress. */
const SETTLE_MS_COMPLETE = 20_000;
const PUBLISH_THROTTLE_MS = 1_000;
const ANALYSIS_WINDOW_DAYS = 30;
const ANALYSIS_MAX_CHATS = 50;
const ANALYSIS_RECENT_MESSAGES = 30;
const ANALYSIS_CONCURRENCY = 5;

const MEDIA_PREVIEW: Record<string, string> = {
  image: '📷 Photo',
  audio: '🎵 Voice message',
  video: '🎬 Video',
  document: '📄 Document',
  sticker: '🎨 Sticker',
  location: '📍 Location',
  contact_card: '👤 Contact',
};

/** Name source ranking: higher wins; >= SAVED_NAME overwrites an existing name. */
const RANK_PUSH = 1;
const RANK_BUSINESS = 2;
const RANK_SAVED_NAME = 3;

/** A late batch within this window after completion reopens the same job. */
const REOPEN_WINDOW_MS = 30 * 60_000;

interface UserSyncState {
  jobId: string;
  settleTimer: NodeJS.Timeout | null;
  lastPublishAt: number;
  lidToPn: Map<string, string>;
  cancelled: boolean;
  finalised: boolean;
  finalisedAt: number;
  startedAt: number;
  /** Conversations already sent for AI analysis by this job — never queue twice. */
  analysed: Set<string>;
}

interface ContactCandidate {
  jid: string;
  name: string | null;
  rank: number;
  isGroup: boolean;
  lastAtMs: number | null;
}

function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

/** Real chats only: 1:1 (phone or LID) and groups. Excludes status/broadcast lists, newsletters, calls. */
function isSyncableJid(jid: string): boolean {
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid') || jid.endsWith('@g.us');
}

function phoneFromJid(jid: string): string | null {
  return jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0].split(':')[0] : null;
}

function previewFor(msg: NormalisedMessage): string | null {
  return (msg.body?.slice(0, 200) ?? MEDIA_PREVIEW[msg.messageType] ?? null)?.slice(0, 500) ?? null;
}

export class HistorySyncPipeline {
  private readonly states = new Map<string, UserSyncState>();
  /** Per-user serial chain: every batch and the finaliser run strictly in order. */
  private readonly chains = new Map<string, Promise<void>>();

  constructor(
    private readonly db: Pool,
    private readonly redis: Redis,
    private readonly intelligenceUrl: string,
    private readonly internalSecret: string,
  ) {}

  /** Queue one history batch. Batches for the same user run strictly in order. */
  ingest(userId: string, payload: HistorySetPayload): void {
    const run = async () => {
      const state = await this.ensureState(userId);
      if (state.cancelled || state.finalised) return;
      if (await this.isSkipped(userId)) {
        await this.cancel(userId, state, 'Historical sync skipped by user');
        return;
      }
      try {
        await this.processBatch(userId, state, payload);
      } catch (err) {
        console.error(`[history-sync] batch failed for ${userId}:`, err);
        await this.db.query(
          `UPDATE sync_jobs SET error_message = $2, updated_at = NOW() WHERE id = $1`,
          [state.jobId, `Batch import error: ${String(err).slice(0, 300)}`],
        ).catch(() => {});
      }
      this.armSettle(userId, state, payload.progress);
    };
    this.enqueue(userId, run);
  }

  private enqueue(userId: string, task: () => Promise<void>): void {
    const prev = this.chains.get(userId) ?? Promise.resolve();
    const next = prev.then(task).catch((err) => {
      console.error(`[history-sync] task failed for ${userId}:`, err);
    });
    this.chains.set(userId, next);
  }

  private async ensureState(userId: string): Promise<UserSyncState> {
    const existing = this.states.get(userId);
    if (existing && !existing.finalised && !existing.cancelled) return existing;
    if (existing?.cancelled && Date.now() - existing.startedAt < REOPEN_WINDOW_MS) {
      // The user skipped this import — remaining batches of the same link are
      // dropped (ingest() returns early on a cancelled state).
      return existing;
    }
    if (existing?.finalised && !existing.cancelled && Date.now() - existing.finalisedAt < REOPEN_WINDOW_MS) {
      // A straggler batch shortly after completion: reopen the same job.
      existing.finalised = false;
      await this.db.query(
        `UPDATE sync_jobs SET status = 'running', sync_phase = 'importing', completed_at = NULL, updated_at = NOW()
         WHERE id = $1`,
        [existing.jobId],
      );
      return existing;
    }

    // A fresh link: clear any stale "skip" flag from an earlier session so it
    // doesn't silently swallow this import, and close jobs from older flows.
    await this.redis.del(`history:skip:${userId}`).catch(() => {});
    await this.db.query(
      `UPDATE sync_jobs SET status = 'cancelled', updated_at = NOW()
       WHERE user_id = $1 AND status IN ('pending', 'running')`,
      [userId],
    );
    const { rows: [job] } = await this.db.query<{ id: string }>(
      `INSERT INTO sync_jobs (user_id, status, sync_phase, source, started_at)
       VALUES ($1, 'running', 'importing', 'initial_link', NOW())
       RETURNING id`,
      [userId],
    );
    const { rows: lidRows } = await this.db.query<{ lid_jid: string; pn_jid: string }>(
      `SELECT lid_jid, pn_jid FROM whatsapp_lid_map WHERE user_id = $1`,
      [userId],
    );
    const state: UserSyncState = {
      jobId: job.id,
      settleTimer: null,
      lastPublishAt: 0,
      lidToPn: new Map(lidRows.map((r) => [r.lid_jid, r.pn_jid])),
      cancelled: false,
      finalised: false,
      finalisedAt: 0,
      startedAt: Date.now(),
      analysed: new Set(),
    };
    this.states.set(userId, state);
    console.log(`[history-sync] started job ${job.id} for ${userId}`);
    await this.publish(userId, state, { status: 'running', phase: 'importing' }, true);
    return state;
  }

  private async isSkipped(userId: string): Promise<boolean> {
    return !!(await this.redis.get(`history:skip:${userId}`).catch(() => null));
  }

  // ── Batch import ──────────────────────────────────────────────────────────

  private async processBatch(userId: string, state: UserSyncState, payload: HistorySetPayload): Promise<void> {
    await this.learnLidPairs(userId, state, payload);
    const canon = (jid: string) => (jid.endsWith('@lid') ? state.lidToPn.get(jid) ?? jid : jid);

    // 1. Contact candidates from every source in the batch.
    const candidates = new Map<string, ContactCandidate>();
    const offer = (rawJid: string, name: string | null, rank: number, lastAtMs: number | null) => {
      if (!rawJid || !isSyncableJid(rawJid)) return;
      const jid = canon(rawJid);
      const cleanName = name?.trim() || null;
      const cur = candidates.get(jid);
      if (!cur) {
        candidates.set(jid, { jid, name: cleanName, rank: cleanName ? rank : 0, isGroup: isGroupJid(jid), lastAtMs });
        return;
      }
      if (cleanName && rank > cur.rank) { cur.name = cleanName; cur.rank = rank; }
      if (lastAtMs && (!cur.lastAtMs || lastAtMs > cur.lastAtMs)) cur.lastAtMs = lastAtMs;
    };
    for (const chat of payload.chats) offer(chat.id, chat.name, RANK_SAVED_NAME, chat.conversationTimestampMs);
    for (const c of payload.contacts) {
      offer(c.id, c.name, RANK_SAVED_NAME, null);
      offer(c.id, c.verifiedName, RANK_BUSINESS, null);
      offer(c.id, c.notify, RANK_PUSH, null);
    }
    for (const m of payload.messages) {
      offer(m.jid, m.fromMe || isGroupJid(m.jid) ? null : m.displayName, RANK_PUSH, m.timestampMs || null);
    }

    const contactIds = await this.upsertContacts(userId, state, [...candidates.values()]);

    // 2. Conversations: every real chat in the batch + every chat with messages.
    const convRows = new Map<string, { jid: string; lastAtMs: number | null; preview: string | null; archived: boolean }>();
    const touchConv = (jid: string, lastAtMs: number | null, preview: string | null, archived = false) => {
      const cur = convRows.get(jid);
      if (!cur) { convRows.set(jid, { jid, lastAtMs, preview, archived }); return; }
      if (lastAtMs && (!cur.lastAtMs || lastAtMs >= cur.lastAtMs)) {
        cur.lastAtMs = lastAtMs;
        if (preview) cur.preview = preview;
      }
    };
    for (const chat of payload.chats) {
      if (isSyncableJid(chat.id)) touchConv(canon(chat.id), chat.conversationTimestampMs, null, chat.archived);
    }
    const messages = payload.messages.filter((m) => isSyncableJid(m.jid) && m.waMessageId);
    for (const m of messages) touchConv(canon(m.jid), m.timestampMs || null, previewFor(m));

    const convIds = await this.upsertConversations(userId, contactIds, [...convRows.values()]);

    // 3. Messages, in chunks.
    let inserted = 0;
    for (let i = 0; i < messages.length; i += MESSAGE_CHUNK) {
      if (await this.isSkipped(userId)) {
        await this.cancel(userId, state, 'Historical sync cancelled');
        return;
      }
      inserted += await this.insertMessages(convIds, canon, messages.slice(i, i + MESSAGE_CHUNK));
    }

    // 4. Job counters + progress.
    await this.db.query(
      `UPDATE sync_jobs SET
         processed_messages = processed_messages + $2,
         total_messages = total_messages + $3,
         batches_received = batches_received + 1,
         wa_progress = COALESCE($4, wa_progress),
         total_conversations = (SELECT COUNT(*) FROM conversations WHERE user_id = $5),
         updated_at = NOW()
       WHERE id = $1`,
      [state.jobId, inserted, messages.length, payload.progress, userId],
    );
    console.log(
      `[history-sync] ${userId} batch: contacts=${candidates.size} chats=${convRows.size} ` +
      `messages=${inserted}/${messages.length} progress=${payload.progress ?? '-'}`,
    );
    await this.publish(userId, state, { status: 'running', phase: 'importing' }, true);
  }

  private async learnLidPairs(userId: string, state: UserSyncState, payload: HistorySetPayload): Promise<void> {
    const pairs = new Map<string, string>();
    const add = (lid: string | null, pn: string | null) => {
      if (lid?.endsWith('@lid') && pn?.endsWith('@s.whatsapp.net')) pairs.set(lid, pn);
    };
    for (const chat of payload.chats as HistoryChat[]) {
      add(chat.lidJid, chat.id);
      add(chat.id, chat.pnJid);
    }
    for (const c of payload.contacts) add(c.lid, c.id);
    const fresh = [...pairs].filter(([lid, pn]) => state.lidToPn.get(lid) !== pn);
    if (!fresh.length) return;
    for (const [lid, pn] of fresh) state.lidToPn.set(lid, pn);
    await this.persistLidPairs(userId, fresh);
  }

  private async persistLidPairs(userId: string, pairs: [string, string][]): Promise<void> {
    if (!pairs.length) return;
    await this.db.query(
      `INSERT INTO whatsapp_lid_map (user_id, lid_jid, pn_jid)
       SELECT $1, l, p FROM unnest($2::text[], $3::text[]) AS t(l, p)
       ON CONFLICT (user_id, lid_jid) DO UPDATE SET pn_jid = EXCLUDED.pn_jid, updated_at = NOW()`,
      [userId, pairs.map(([l]) => l), pairs.map(([, p]) => p)],
    );
  }

  // ── Address book (contacts.upsert / contacts.update) ──────────────────────

  /**
   * Saved names and LID pairings from WhatsApp's address book. Arrives right
   * after a link (app-state sync), on resyncContacts(), and as push-name
   * changes. Runs on the same per-user chain as history batches.
   */
  applyContactHints(userId: string, hints: HistoryContact[]): void {
    this.enqueue(userId, async () => {
      const pairs = new Map<string, string>();
      for (const h of hints) {
        if (h.lid?.endsWith('@lid') && h.id.endsWith('@s.whatsapp.net')) pairs.set(h.lid, h.id);
      }
      const state = this.states.get(userId);
      if (state) for (const [lid, pn] of pairs) state.lidToPn.set(lid, pn);
      await this.persistLidPairs(userId, [...pairs]);
      const merged = pairs.size ? await this.reconcileLidContacts(userId) : 0;

      // Names, keyed by the canonical (phone) JID when we know it.
      const canonOf = (jid: string) => (jid.endsWith('@lid') ? pairs.get(jid) ?? jid : jid);
      const saved = new Map<string, string>();
      const push = new Map<string, string>();
      for (const h of hints) {
        const jid = canonOf(h.id);
        if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) continue;
        const savedName = h.name?.trim() || h.verifiedName?.trim();
        if (savedName) saved.set(jid, savedName);
        else if (h.notify?.trim()) push.set(jid, h.notify.trim());
      }
      let named = 0;
      if (saved.size) {
        const r = await this.db.query(
          `UPDATE contacts SET display_name = x.n, updated_at = NOW()
           FROM unnest($2::text[], $3::text[]) AS x(j, n)
           WHERE contacts.user_id = $1 AND contacts.whatsapp_jid = x.j
             AND contacts.display_name IS DISTINCT FROM x.n`,
          [userId, [...saved.keys()], [...saved.values()]],
        );
        named += r.rowCount ?? 0;
      }
      if (push.size) {
        const r = await this.db.query(
          `UPDATE contacts SET display_name = x.n, updated_at = NOW()
           FROM unnest($2::text[], $3::text[]) AS x(j, n)
           WHERE contacts.user_id = $1 AND contacts.whatsapp_jid = x.j
             AND COALESCE(contacts.display_name, '') = ''`,
          [userId, [...push.keys()], [...push.values()]],
        );
        named += r.rowCount ?? 0;
      }
      if (pairs.size || named) {
        console.log(`[history-sync] ${userId} contact hints: ${hints.length} in, pairs=${pairs.size} merged=${merged} named=${named}`);
      }
    });
  }

  /**
   * Fold contacts/conversations stored under an @lid JID onto the phone-number
   * JID whatsapp_lid_map now knows for them, so one person is one contact and
   * one chat. Renames in place when only the LID row exists; otherwise moves
   * the LID chat's messages into the phone chat, deletes the LID chat and marks
   * the LID contact merged (contacts are never deleted — many tables point at
   * them). Returns how many LID contacts were resolved.
   */
  async reconcileLidContacts(userId: string): Promise<number> {
    const client = await this.db.connect();
    let resolved = 0;
    try {
      await client.query('BEGIN');
      // 1. Rename in place where the phone-number row doesn't exist yet.
      const renamed = await client.query(
        `WITH m AS (
           SELECT DISTINCT ON (pn_jid) lid_jid, pn_jid FROM whatsapp_lid_map
           WHERE user_id = $1 ORDER BY pn_jid, updated_at DESC
         )
         UPDATE contacts c
            SET whatsapp_jid = m.pn_jid,
                phone_number = split_part(split_part(m.pn_jid, '@', 1), ':', 1),
                updated_at = NOW()
           FROM m
          WHERE c.user_id = $1 AND c.whatsapp_jid = m.lid_jid AND c.merged_into_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM contacts p WHERE p.user_id = $1 AND p.whatsapp_jid = m.pn_jid)`,
        [userId],
      );
      resolved += renamed.rowCount ?? 0;
      await client.query(
        `WITH m AS (
           SELECT DISTINCT ON (pn_jid) lid_jid, pn_jid FROM whatsapp_lid_map
           WHERE user_id = $1 ORDER BY pn_jid, updated_at DESC
         )
         UPDATE conversations cv SET whatsapp_chat_id = m.pn_jid, updated_at = NOW()
           FROM m
          WHERE cv.user_id = $1 AND cv.whatsapp_chat_id = m.lid_jid
            AND NOT EXISTS (SELECT 1 FROM conversations p WHERE p.user_id = $1 AND p.whatsapp_chat_id = m.pn_jid)`,
        [userId],
      );

      // 2. Both rows exist: merge the LID one into the phone one.
      const { rows: dupes } = await client.query<{
        lid_id: string; pn_id: string; lid_jid: string; pn_jid: string;
      }>(
        `SELECT l.id AS lid_id, p.id AS pn_id, l.whatsapp_jid AS lid_jid, p.whatsapp_jid AS pn_jid
           FROM whatsapp_lid_map m
           JOIN contacts l ON l.user_id = m.user_id AND l.whatsapp_jid = m.lid_jid AND l.merged_into_id IS NULL
           JOIN contacts p ON p.user_id = m.user_id AND p.whatsapp_jid = m.pn_jid
          WHERE m.user_id = $1`,
        [userId],
      );
      for (const d of dupes) {
        const { rows: [pc] } = await client.query<{ id: string }>(
          `SELECT id FROM conversations WHERE user_id = $1 AND whatsapp_chat_id = $2`, [userId, d.pn_jid],
        );
        const { rows: lcs } = await client.query<{ id: string }>(
          `SELECT id FROM conversations WHERE user_id = $1 AND (contact_id = $2 OR whatsapp_chat_id = $3)
             AND whatsapp_chat_id <> $4`,
          [userId, d.lid_id, d.lid_jid, d.pn_jid],
        );
        for (const lc of lcs) {
          if (!pc) {
            await client.query(
              `UPDATE conversations SET contact_id = $2, whatsapp_chat_id = $3, updated_at = NOW() WHERE id = $1`,
              [lc.id, d.pn_id, d.pn_jid],
            );
            continue;
          }
          // Drop LID-side copies of messages the phone chat already has.
          await client.query(
            `UPDATE messages SET quoted_message_id = NULL
              WHERE quoted_message_id IN (
                SELECT l.id FROM messages l JOIN messages p
                  ON p.conversation_id = $2 AND p.whatsapp_message_id = l.whatsapp_message_id
                 WHERE l.conversation_id = $1)`,
            [lc.id, pc.id],
          );
          await client.query(
            `DELETE FROM messages l USING messages p
              WHERE l.conversation_id = $1 AND p.conversation_id = $2
                AND p.whatsapp_message_id = l.whatsapp_message_id`,
            [lc.id, pc.id],
          );
          await client.query(`UPDATE messages SET conversation_id = $2 WHERE conversation_id = $1`, [lc.id, pc.id]);
          await client.query(
            `UPDATE conversations p SET
               last_message_at = GREATEST(p.last_message_at, l.last_message_at),
               last_message_preview = CASE WHEN l.last_message_at > p.last_message_at OR p.last_message_at IS NULL
                                           THEN COALESCE(l.last_message_preview, p.last_message_preview)
                                           ELSE p.last_message_preview END,
               updated_at = NOW()
               FROM conversations l WHERE p.id = $2 AND l.id = $1`,
            [lc.id, pc.id],
          );
          await client.query(`DELETE FROM conversations WHERE id = $1`, [lc.id]);
        }
        await client.query(
          `UPDATE contacts p SET
             display_name = COALESCE(NULLIF(p.display_name, ''), l.display_name),
             last_message_at = GREATEST(p.last_message_at, l.last_message_at),
             updated_at = NOW()
             FROM contacts l WHERE p.id = $2 AND l.id = $1`,
          [d.lid_id, d.pn_id],
        );
        await client.query(
          `UPDATE contacts SET merged_into_id = $2, updated_at = NOW() WHERE id = $1`,
          [d.lid_id, d.pn_id],
        );
        resolved++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    return resolved;
  }

  private async upsertContacts(
    userId: string,
    state: UserSyncState,
    candidates: ContactCandidate[],
  ): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    if (!candidates.length) return ids;
    const { rows } = await this.db.query<{ id: string; whatsapp_jid: string; inserted: boolean }>(
      `INSERT INTO contacts (user_id, whatsapp_jid, phone_number, display_name, is_group, last_message_at)
       SELECT $1, j, p, n, g, t
       FROM unnest($2::text[], $3::text[], $4::text[], $5::bool[], $6::timestamptz[]) AS x(j, p, n, g, t)
       ON CONFLICT (user_id, whatsapp_jid) DO UPDATE SET
         display_name = COALESCE(contacts.display_name, EXCLUDED.display_name),
         last_message_at = GREATEST(contacts.last_message_at, EXCLUDED.last_message_at),
         updated_at = NOW()
       RETURNING id, whatsapp_jid, (xmax = 0) AS inserted`,
      [
        userId,
        candidates.map((c) => c.jid),
        candidates.map((c) => (c.isGroup ? null : phoneFromJid(c.jid))),
        candidates.map((c) => c.name),
        candidates.map((c) => c.isGroup),
        candidates.map((c) => (c.lastAtMs ? new Date(c.lastAtMs) : null)),
      ],
    );
    // Authoritative names (saved address-book name, group subject) replace
    // whatever a push name put there earlier. Never touches custom_name.
    const authoritative = candidates.filter((c) => c.name && c.rank >= RANK_SAVED_NAME);
    if (authoritative.length) {
      await this.db.query(
        `UPDATE contacts SET display_name = x.n, updated_at = NOW()
         FROM unnest($2::text[], $3::text[]) AS x(j, n)
         WHERE contacts.user_id = $1 AND contacts.whatsapp_jid = x.j
           AND contacts.display_name IS DISTINCT FROM x.n`,
        [userId, authoritative.map((c) => c.jid), authoritative.map((c) => c.name)],
      );
    }
    const newIds: string[] = [];
    for (const r of rows) {
      ids.set(r.whatsapp_jid, r.id);
      if (r.inserted) newIds.push(r.id);
    }
    if (newIds.length) {
      await this.db.query(
        `INSERT INTO relationships (user_id, contact_id, last_interaction_at)
         SELECT $1, unnest($2::uuid[]), NOW()
         ON CONFLICT (user_id, contact_id) DO NOTHING`,
        [userId, newIds],
      );
      await this.db.query(
        `UPDATE sync_jobs SET contacts_created = contacts_created + $2 WHERE id = $1`,
        [state.jobId, newIds.length],
      );
    }
    return ids;
  }

  private async upsertConversations(
    userId: string,
    contactIds: Map<string, string>,
    convs: { jid: string; lastAtMs: number | null; preview: string | null; archived: boolean }[],
  ): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    const usable = convs.filter((c) => contactIds.has(c.jid));
    if (!usable.length) return ids;
    const { rows } = await this.db.query<{ id: string; whatsapp_chat_id: string }>(
      `INSERT INTO conversations (user_id, contact_id, whatsapp_chat_id, last_message_at, last_message_preview, is_archived)
       SELECT $1, c, j, t, p, a
       FROM unnest($2::uuid[], $3::text[], $4::timestamptz[], $5::text[], $6::bool[]) AS x(c, j, t, p, a)
       ON CONFLICT (user_id, whatsapp_chat_id) DO UPDATE SET
         last_message_at = GREATEST(conversations.last_message_at, EXCLUDED.last_message_at),
         last_message_preview = CASE
           WHEN EXCLUDED.last_message_preview IS NOT NULL
            AND (conversations.last_message_at IS NULL OR EXCLUDED.last_message_at >= conversations.last_message_at)
           THEN EXCLUDED.last_message_preview
           ELSE conversations.last_message_preview
         END,
         updated_at = NOW()
       RETURNING id, whatsapp_chat_id`,
      [
        userId,
        usable.map((c) => contactIds.get(c.jid)!),
        usable.map((c) => c.jid),
        usable.map((c) => (c.lastAtMs ? new Date(c.lastAtMs) : null)),
        usable.map((c) => c.preview),
        usable.map((c) => c.archived),
      ],
    );
    for (const r of rows) ids.set(r.whatsapp_chat_id, r.id);
    return ids;
  }

  private async insertMessages(
    convIds: Map<string, string>,
    canon: (jid: string) => string,
    chunk: NormalisedMessage[],
  ): Promise<number> {
    // Dedupe within the chunk — ON CONFLICT can't resolve two identical rows in one statement.
    const seen = new Set<string>();
    const rows = chunk.flatMap((m) => {
      const convId = convIds.get(canon(m.jid));
      const key = `${convId}|${m.waMessageId}`;
      if (!convId || seen.has(key) || !m.timestampMs) return [];
      seen.add(key);
      return [{ convId, m }];
    });
    if (!rows.length) return 0;

    const { rowCount } = await this.db.query(
      `INSERT INTO messages
         (conversation_id, whatsapp_message_id, sender_type, message_type, body,
          media_url, media_mime_type, whatsapp_timestamp, sender_display_name, sender_jid)
       SELECT c, w, s::message_sender, t::message_type, b, mu, mm, ts, sn, sj
       FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[],
                   $6::text[], $7::text[], $8::timestamptz[], $9::text[], $10::text[])
            AS x(c, w, s, t, b, mu, mm, ts, sn, sj)
       ON CONFLICT (conversation_id, whatsapp_message_id) DO NOTHING`,
      [
        rows.map((r) => r.convId),
        rows.map((r) => r.m.waMessageId),
        rows.map((r) => (r.m.fromMe ? 'user' : 'contact')),
        rows.map((r) => r.m.messageType),
        rows.map((r) => r.m.body),
        rows.map((r) => r.m.mediaUrl),
        rows.map((r) => r.m.mediaMimeType),
        rows.map((r) => new Date(r.m.timestampMs)),
        rows.map((r) => r.m.groupSenderName),
        rows.map((r) => r.m.groupSenderJid),
      ],
    );

    // Link replies to the messages they quote (both may be in this chunk).
    const quoted = rows.filter((r) => r.m.quotedWaMessageId);
    if (quoted.length) {
      await this.db.query(
        `UPDATE messages m SET quoted_message_id = q.id
         FROM unnest($1::uuid[], $2::text[], $3::text[]) AS t(conv_id, wa_id, quoted_wa_id)
         JOIN messages q ON q.conversation_id = t.conv_id AND q.whatsapp_message_id = t.quoted_wa_id
         WHERE m.conversation_id = t.conv_id AND m.whatsapp_message_id = t.wa_id
           AND m.quoted_message_id IS NULL`,
        [
          quoted.map((r) => r.convId),
          quoted.map((r) => r.m.waMessageId),
          quoted.map((r) => r.m.quotedWaMessageId),
        ],
      );
    }
    return rowCount ?? 0;
  }

  // ── Completion ────────────────────────────────────────────────────────────

  private armSettle(userId: string, state: UserSyncState, progress: number | null): void {
    if (state.settleTimer) clearTimeout(state.settleTimer);
    if (state.cancelled || state.finalised) return;
    const delay = progress !== null && progress >= 100 ? SETTLE_MS_COMPLETE : SETTLE_MS;
    state.settleTimer = setTimeout(() => {
      this.enqueue(userId, () => this.finalise(userId, state));
    }, delay);
  }

  private async finalise(userId: string, state: UserSyncState): Promise<void> {
    if (state.cancelled || state.finalised) return;
    state.finalised = true;
    state.finalisedAt = Date.now();

    await this.db.query(
      `UPDATE sync_jobs SET sync_phase = 'analysing', updated_at = NOW() WHERE id = $1`,
      [state.jobId],
    );
    await this.publish(userId, state, { status: 'running', phase: 'analysing' }, true);

    // Pairs can arrive in a later batch than the chats they describe: fold any
    // remaining @lid rows onto their phone-number rows before picking chats.
    try {
      const merged = await this.reconcileLidContacts(userId);
      if (merged) console.log(`[history-sync] ${userId} reconciled ${merged} @lid contacts`);
    } catch (err) {
      console.error(`[history-sync] ${userId} LID reconcile failed:`, err);
    }

    // Recent, real 1:1 conversations where the contact actually said something.
    const { rows: candidates } = await this.db.query<{ id: string; contact_id: string; name: string | null }>(
      `SELECT c.id, c.contact_id, COALESCE(co.custom_name, co.display_name, co.phone_number) AS name
       FROM conversations c
       JOIN contacts co ON co.id = c.contact_id
       WHERE c.user_id = $1
         AND co.is_group = FALSE
         AND c.last_message_at >= NOW() - ($2 || ' days')::interval
         AND EXISTS (
           SELECT 1 FROM messages m
           WHERE m.conversation_id = c.id AND m.sender_type = 'contact' AND m.body IS NOT NULL
         )
       ORDER BY c.last_message_at DESC
       LIMIT $3`,
      [userId, String(ANALYSIS_WINDOW_DAYS), ANALYSIS_MAX_CHATS],
    );

    const toQueue = candidates.filter((c) => !state.analysed.has(c.id));
    let queued = state.analysed.size;
    for (let i = 0; i < toQueue.length; i += ANALYSIS_CONCURRENCY) {
      if (await this.isSkipped(userId)) break;
      const slice = toQueue.slice(i, i + ANALYSIS_CONCURRENCY);
      const results = await Promise.allSettled(slice.map((c) => this.queueAnalysis(userId, c.id, c.contact_id)));
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled' && r.value) state.analysed.add(slice[idx].id);
      });
      queued = state.analysed.size;
      await this.db.query(
        `UPDATE sync_jobs SET analysis_queued = $2, processed_conversations = $2,
                current_chat_name = $3, updated_at = NOW()
         WHERE id = $1`,
        [state.jobId, queued, slice[slice.length - 1]?.name ?? null],
      );
      await this.publish(userId, state, {
        status: 'running', phase: 'analysing',
        processedConversations: queued, totalConversationsToAnalyse: candidates.length,
      });
    }

    const { rows: [job] } = await this.db.query<{
      total_conversations: number; processed_messages: number; contacts_created: number;
    }>(
      `UPDATE sync_jobs SET status = 'completed', sync_phase = 'complete', completed_at = NOW(),
              current_chat_name = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING total_conversations, processed_messages, contacts_created`,
      [state.jobId],
    );
    console.log(
      `[history-sync] job ${state.jobId} complete for ${userId}: ${job?.total_conversations} chats, ` +
      `${job?.processed_messages} messages, ${queued}/${candidates.length} chats queued for AI analysis`,
    );
    await this.publish(userId, state, {
      status: 'completed', phase: 'complete', analysisQueued: queued,
    }, true);
  }

  private async queueAnalysis(userId: string, conversationId: string, contactId: string): Promise<boolean> {
    const res = await fetch(`${this.intelligenceUrl}/internal/conversations/${conversationId}/analyse-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': this.internalSecret },
      body: JSON.stringify({ user_id: userId, contact_id: contactId, recent_count: ANALYSIS_RECENT_MESSAGES }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`[history-sync] analyse-history ${conversationId} -> ${res.status}`);
      return false;
    }
    return true;
  }

  private async cancel(userId: string, state: UserSyncState, message: string): Promise<void> {
    if (state.cancelled) return;
    state.cancelled = true;
    if (state.settleTimer) clearTimeout(state.settleTimer);
    await this.db.query(
      `UPDATE sync_jobs SET status = 'cancelled', sync_phase = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [state.jobId],
    );
    await this.publish(userId, state, { status: 'cancelled', phase: 'skipped', message }, true);
  }

  // ── Progress ──────────────────────────────────────────────────────────────

  private async publish(
    userId: string,
    state: UserSyncState,
    extra: Record<string, unknown>,
    force = false,
  ): Promise<void> {
    const now = Date.now();
    if (!force && now - state.lastPublishAt < PUBLISH_THROTTLE_MS) return;
    state.lastPublishAt = now;
    const { rows: [job] } = await this.db.query<{
      total_conversations: number; processed_messages: number; total_messages: number;
      wa_progress: number | null; contacts_created: number; analysis_queued: number;
    }>(
      `SELECT total_conversations, processed_messages, total_messages, wa_progress,
              contacts_created, analysis_queued
       FROM sync_jobs WHERE id = $1`,
      [state.jobId],
    );
    await this.redis.publish(`history:progress:${userId}`, JSON.stringify({
      jobId: state.jobId,
      totalConversations: job?.total_conversations ?? 0,
      processedMessages: job?.processed_messages ?? 0,
      totalMessages: job?.total_messages ?? 0,
      contactsCreated: job?.contacts_created ?? 0,
      percentage: job?.wa_progress ?? null,
      ...extra,
    })).catch(() => {});
  }
}
