import type { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../lib/db';
import { redis } from '../lib/redis';
import { queues } from '../lib/queue';
import { authenticate } from '../plugins/authenticate';
import { getEffectiveScope } from '../lib/org-scope';

/**
 * Zuri panel (Inbox side panel) — "Now" tab.
 *  - auto-reply status for this chat, with the scheduled reply (send now / edit / cancel)
 *  - pending reply suggestions
 *  - open loops: unanswered questions, promises, upcoming dates (dismissable)
 *  - catch-up: what happened since you last looked + a one-line read (AI, cached)
 */

const INTELLIGENCE_URL = process.env.INTELLIGENCE_SERVICE_URL ?? 'http://localhost:8000';
const CATCH_UP_TTL_SEC = 6 * 60 * 60;

interface ConvRow {
  id: string;
  user_id: string;
  contact_id: string;
  zuri_last_viewed_at: Date | null;
  is_group: boolean;
  whatsapp_chat_id: string | null;
}

async function ownedConversation(request: FastifyRequest, conversationId: string): Promise<ConvRow | null> {
  const { userId } = request.user as { userId: string };
  const scope = await getEffectiveScope(userId);
  const { rows: [row] } = await db.query<ConvRow>(
    `SELECT c.id, c.user_id, c.contact_id, c.zuri_last_viewed_at, c.whatsapp_chat_id,
            COALESCE(co.is_group, false) AS is_group
     FROM conversations c JOIN contacts co ON co.id = c.contact_id
     WHERE c.id = $1 AND (c.user_id = $2::uuid OR c.user_id = $3::uuid
        OR ($4::uuid IS NOT NULL AND c.organization_id = $4::uuid))`,
    [conversationId, userId, scope.ownerUserId, scope.organizationId],
  );
  return row ?? null;
}

/** A scheduled automatic reply the caller owns, still waiting to send. */
async function ownedScheduledReply(request: FastifyRequest, suggestionId: string) {
  const { userId } = request.user as { userId: string };
  const scope = await getEffectiveScope(userId);
  const { rows: [row] } = await db.query<{ id: string; status: string; sent_at: Date | null; conversation_id: string }>(
    `SELECT sr.id, sr.status::text AS status, sr.sent_at, m.conversation_id
     FROM suggested_replies sr
     JOIN messages m ON m.id = sr.message_id
     JOIN conversations c ON c.id = m.conversation_id
     WHERE sr.id = $1 AND (c.user_id = $2::uuid OR c.user_id = $3::uuid
        OR ($4::uuid IS NOT NULL AND c.organization_id = $4::uuid))`,
    [suggestionId, userId, scope.ownerUserId, scope.organizationId],
  );
  return row ?? null;
}

const STOP = new Set(['a', 'an', 'the', 'to', 'will', 'of', 'for', 'and', 'if', 'in', 'on', 'be', 'is', 'can', 'within', 'no']);
function words(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w)));
}
/** Same commitment re-detected across messages ("A rep will call" vs "Rep will call soon"). */
function nearDuplicate(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size) >= 0.7;
}


async function ownedContact(request: FastifyRequest, contactId: string) {
  const { userId } = request.user as { userId: string };
  const scope = await getEffectiveScope(userId);
  const { rows: [row] } = await db.query<{ id: string; user_id: string }>(
    `SELECT co.id, co.user_id FROM contacts co
     WHERE co.id = $1 AND (co.user_id = $2::uuid OR co.user_id = $3::uuid
        OR ($4::uuid IS NOT NULL AND co.organization_id = $4::uuid))`,
    [contactId, userId, scope.ownerUserId, scope.organizationId],
  );
  return row ?? null;
}

/** Relationship types that make the business section (company, stage, documents) relevant. */
const BUSINESS_RELATIONSHIPS = new Set(['client', 'customer', 'business_contact', 'colleague', 'supplier', 'vendor', 'partner_business', 'lead', 'prospect']);
const RELATIONSHIP_TYPES = ['spouse', 'partner', 'family', 'close_friend', 'friend', 'colleague', 'client', 'business_contact', 'acquaintance'] as const;
const DATE_TYPES = ['birthday', 'anniversary'] as const;

/** Next yearly occurrence of a date (birthdays/anniversaries), as YYYY-MM-DD + days away. */
function nextOccurrence(isoDate: string): { next: string; daysAway: number } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [, m, d] = isoDate.split('-').map(Number);
  let next = new Date(today.getFullYear(), m - 1, d);
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
  const daysAway = Math.round((next.getTime() - today.getTime()) / 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { next: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`, daysAway };
}

function loopKey(kind: string, text: string): string {
  const norm = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  return `${kind}:${crypto.createHash('sha1').update(norm).digest('hex').slice(0, 16)}`;
}

const AUTO_REPLY_REASONS: Record<string, string> = {
  disabled: 'Auto-reply is switched off for your account',
  review_mode: 'Your account is set to draft replies for review, not send them',
  not_included: "This chat isn't on your auto-reply list",
  excluded: 'This chat is excluded from auto-reply',
  group: 'Auto-reply skips group chats',
};

export async function zuriPanelRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/conversations/:id/zuri/now ───────────────────────────────────
  fastify.get('/api/conversations/:id/zuri/now', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const conv = await ownedConversation(request, id);
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

    const [settingsRes, listRes, scheduledRes, suggestionsRes, analysesRes, questionsRes, resolvedRes] = await Promise.all([
      db.query(
        `SELECT enabled, approval_mode, inclusion_mode, skip_groups, send_delay_seconds, send_delay_max_seconds
         FROM auto_response_settings WHERE user_id = $1`,
        [conv.user_id],
      ),
      db.query(
        `SELECT EXISTS (SELECT 1 FROM auto_reply_inclusions WHERE user_id = $1 AND contact_id = $2) AS included,
                EXISTS (SELECT 1 FROM auto_reply_exclusions WHERE user_id = $1 AND contact_id = $2) AS excluded`,
        [conv.user_id, conv.contact_id],
      ),
      // Automatic replies queued but not yet sent.
      db.query(
        `SELECT sr.id, COALESCE(sr.edited_text, sr.suggestion_text) AS text, sr.scheduled_send_at,
                sr.message_id, m.body AS replying_to
         FROM suggested_replies sr JOIN messages m ON m.id = sr.message_id
         WHERE m.conversation_id = $1 AND sr.status = 'approved' AND sr.sent_at IS NULL
           AND sr.created_at > NOW() - INTERVAL '1 day'
         ORDER BY sr.created_at DESC LIMIT 3`,
        [id],
      ),
      // Pending suggestions for the latest incoming message, unless you've replied since.
      db.query(
        `WITH last_in AS (
           SELECT id, whatsapp_timestamp FROM messages
           WHERE conversation_id = $1 AND sender_type = 'contact' AND is_deleted = false
           ORDER BY whatsapp_timestamp DESC LIMIT 1
         )
         SELECT sr.id, sr.suggestion_text AS text, sr.tone, sr.message_id
         FROM last_in JOIN suggested_replies sr ON sr.message_id = last_in.id
         WHERE sr.status = 'pending'
           AND NOT EXISTS (
             SELECT 1 FROM messages u WHERE u.conversation_id = $1 AND u.sender_type = 'user'
               AND u.whatsapp_timestamp > last_in.whatsapp_timestamp)
         ORDER BY sr.created_at ASC LIMIT 3`,
        [id],
      ),
      db.query(
        `SELECT m.id AS message_id, m.sender_type, m.whatsapp_timestamp,
                ma.promises_detected, ma.events_detected
         FROM message_analyses ma JOIN messages m ON m.id = ma.message_id
         WHERE m.conversation_id = $1 AND m.whatsapp_timestamp > NOW() - INTERVAL '21 days'
           AND (jsonb_array_length(COALESCE(ma.promises_detected, '[]'::jsonb)) > 0
             OR jsonb_array_length(COALESCE(ma.events_detected, '[]'::jsonb)) > 0)
         ORDER BY m.whatsapp_timestamp DESC LIMIT 60`,
        [id],
      ),
      // Their messages that need a response and came after your last message.
      db.query(
        `SELECT m.id, m.body, m.whatsapp_timestamp
         FROM messages m JOIN message_analyses ma ON ma.message_id = m.id
         WHERE m.conversation_id = $1 AND m.sender_type = 'contact' AND m.is_deleted = false
           AND ma.requires_response = true AND m.body IS NOT NULL AND m.body LIKE '%?%'
           AND m.whatsapp_timestamp > COALESCE(
             (SELECT MAX(whatsapp_timestamp) FROM messages WHERE conversation_id = $1 AND sender_type = 'user'),
             'epoch'::timestamptz)
         ORDER BY m.whatsapp_timestamp DESC LIMIT 3`,
        [id],
      ),
      db.query(`SELECT loop_key FROM conversation_loop_resolutions WHERE conversation_id = $1`, [id]),
    ]);

    // ── Auto-reply status ──
    const settings = settingsRes.rows[0];
    const { included, excluded } = listRes.rows[0];
    const inclusionMode = Boolean(settings?.inclusion_mode);
    const onForChat = inclusionMode ? included && !excluded : !excluded;
    let blockedBy: string | null = null;
    if (!settings?.enabled) blockedBy = 'disabled';
    else if (settings.approval_mode !== 'auto') blockedBy = 'review_mode';
    else if (conv.is_group && settings.skip_groups) blockedBy = 'group';
    else if (!onForChat) blockedBy = excluded ? 'excluded' : 'not_included';

    // ── Open loops ──
    const resolved = new Set(resolvedRes.rows.map((r: { loop_key: string }) => r.loop_key));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const promises = new Map<string, { key: string; text: string; at: string; messageId: string }>();
    const promiseWords: Set<string>[] = [];
    const dateWords: Set<string>[] = [];
    const dates = new Map<string, { key: string; title: string; date: string | null; at: string; messageId: string }>();
    for (const r of analysesRes.rows) {
      for (const p of (r.promises_detected ?? []) as Array<{ text?: string }>) {
        if (!p?.text) continue;
        const key = loopKey('promise', p.text);
        const w = words(p.text);
        // Newest first, so the kept wording is the latest; resolving it hides older near-copies too.
        if (promiseWords.some(seen => nearDuplicate(seen, w))) continue;
        promiseWords.push(w);
        if (resolved.has(key) || promises.has(key)) continue;
        promises.set(key, { key, text: p.text, at: r.whatsapp_timestamp, messageId: r.message_id });
      }
      for (const e of (r.events_detected ?? []) as Array<{ title?: string; date?: string | null }>) {
        if (!e?.title) continue;
        if (e.date && new Date(e.date) < today) continue; // past dates aren't open loops
        const key = loopKey('date', `${e.title}|${e.date ?? ''}`);
        const w = words(`${e.title} ${e.date ?? ''}`);
        if (dateWords.some(seen => nearDuplicate(seen, w))) continue;
        dateWords.push(w);
        if (resolved.has(key) || dates.has(key)) continue;
        dates.set(key, { key, title: e.title, date: e.date ?? null, at: r.whatsapp_timestamp, messageId: r.message_id });
      }
    }
    const questions = questionsRes.rows
      .map((q: { id: string; body: string; whatsapp_timestamp: string }) => ({
        key: loopKey('question', q.id), text: q.body, at: q.whatsapp_timestamp, messageId: q.id,
      }))
      .filter((q: { key: string }) => !resolved.has(q.key));

    return reply.send({
      autoReply: {
        onForChat,
        active: blockedBy === null,
        blockedBy,
        blockedReason: blockedBy ? AUTO_REPLY_REASONS[blockedBy] : null,
        inclusionMode,
        delayRange: settings
          ? { minSeconds: settings.send_delay_seconds ?? 0, maxSeconds: Math.max(settings.send_delay_seconds ?? 0, settings.send_delay_max_seconds ?? 0) }
          : null,
      },
      scheduled: scheduledRes.rows.map((s: any) => ({
        id: s.id, text: s.text, sendAt: s.scheduled_send_at, messageId: s.message_id, replyingTo: s.replying_to,
      })),
      suggestions: suggestionsRes.rows.map((s: any) => ({ id: s.id, text: s.text, tone: s.tone, messageId: s.message_id })),
      openLoops: {
        questions,
        promises: [...promises.values()].slice(0, 6),
        dates: [...dates.values()].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')).slice(0, 5),
      },
      lastViewedAt: conv.zuri_last_viewed_at,
    });
  });

  // ── GET /api/conversations/:id/zuri/catch-up?since= ───────────────────────
  // AI digest of what happened since `since` + a one-line read. Cached per
  // (chat, latest message, since) so reopening the panel costs nothing.
  fastify.get('/api/conversations/:id/zuri/catch-up', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { since } = request.query as { since?: string };
    const conv = await ownedConversation(request, id);
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

    const { rows: [last] } = await db.query<{ id: string }>(
      `SELECT id FROM messages WHERE conversation_id = $1 AND is_deleted = false ORDER BY whatsapp_timestamp DESC LIMIT 1`,
      [id],
    );
    if (!last) return reply.send({ digest: [], read: null, newCount: 0 });

    const sinceIso = since && !Number.isNaN(Date.parse(since)) ? new Date(since).toISOString() : null;
    const cacheKey = `zuri:catchup:${id}:${last.id}:${sinceIso ?? 'none'}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return reply.send(JSON.parse(cached));

    try {
      const res = await fetch(`${INTELLIGENCE_URL}/internal/zuri-panel/${id}/catch-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: conv.user_id, since: sinceIso }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) return reply.code(502).send({ error: 'Zuri could not read this chat right now' });
      const data = await res.json();
      await redis.set(cacheKey, JSON.stringify(data), 'EX', CATCH_UP_TTL_SEC).catch(() => {});
      return reply.send(data);
    } catch {
      return reply.code(502).send({ error: 'Zuri could not read this chat right now' });
    }
  });

  // ── POST /api/conversations/:id/zuri/viewed ───────────────────────────────
  fastify.post('/api/conversations/:id/zuri/viewed', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const conv = await ownedConversation(request, id);
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });
    await db.query(`UPDATE conversations SET zuri_last_viewed_at = NOW() WHERE id = $1`, [id]);
    return reply.send({ ok: true });
  });

  // ── POST /api/conversations/:id/zuri/auto-reply {enabled} ─────────────────
  // Per-chat switch. Works with either list style: in "only these contacts"
  // mode it edits the inclusion list; otherwise it edits exclusions.
  fastify.post('/api/conversations/:id/zuri/auto-reply', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    const conv = await ownedConversation(request, id);
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

    const { rows: [s] } = await db.query<{ inclusion_mode: boolean }>(
      `SELECT inclusion_mode FROM auto_response_settings WHERE user_id = $1`, [conv.user_id],
    );
    if (enabled) {
      await db.query(`DELETE FROM auto_reply_exclusions WHERE user_id = $1 AND contact_id = $2`, [conv.user_id, conv.contact_id]);
      if (s?.inclusion_mode) {
        await db.query(
          `INSERT INTO auto_reply_inclusions (user_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [conv.user_id, conv.contact_id],
        );
      }
    } else if (s?.inclusion_mode) {
      await db.query(`DELETE FROM auto_reply_inclusions WHERE user_id = $1 AND contact_id = $2`, [conv.user_id, conv.contact_id]);
    } else {
      await db.query(
        `INSERT INTO auto_reply_exclusions (user_id, contact_id, reason)
         SELECT $1, $2, 'Turned off in Zuri panel'
         WHERE NOT EXISTS (SELECT 1 FROM auto_reply_exclusions WHERE user_id = $1 AND contact_id = $2)`,
        [conv.user_id, conv.contact_id],
      );
    }
    return reply.send({ ok: true, enabled });
  });

  // ── POST /api/conversations/:id/zuri/loops/resolve {loopKey} ──────────────
  fastify.post('/api/conversations/:id/zuri/loops/resolve', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { loopKey: key } = z.object({ loopKey: z.string().min(3).max(80) }).parse(request.body);
    const conv = await ownedConversation(request, id);
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });
    await db.query(
      `INSERT INTO conversation_loop_resolutions (user_id, conversation_id, loop_key)
       VALUES ($1, $2, $3) ON CONFLICT (conversation_id, loop_key) DO NOTHING`,
      [conv.user_id, id, key],
    );
    return reply.send({ ok: true });
  });

  // ── Scheduled automatic replies: send now / edit / cancel ─────────────────
  const jobIdFor = (suggestionId: string) => `auto-reply-${suggestionId}`;

  fastify.post('/api/zuri/scheduled/:suggestionId/send-now', { preHandler: authenticate }, async (request, reply) => {
    const { suggestionId } = request.params as { suggestionId: string };
    const s = await ownedScheduledReply(request, suggestionId);
    if (!s) return reply.code(404).send({ error: 'Reply not found' });
    if (s.status !== 'approved' || s.sent_at) return reply.code(409).send({ error: 'This reply is no longer waiting to send' });
    const job = await queues.sendReply.getJob(jobIdFor(suggestionId));
    if (!job) return reply.code(409).send({ error: 'This reply was queued before Send now existed — it will go out on schedule' });
    if (await job.isDelayed()) await job.promote();
    await db.query(`UPDATE suggested_replies SET scheduled_send_at = NOW(), updated_at = NOW() WHERE id = $1`, [suggestionId]);
    return reply.send({ ok: true });
  });

  fastify.patch('/api/zuri/scheduled/:suggestionId', { preHandler: authenticate }, async (request, reply) => {
    const { suggestionId } = request.params as { suggestionId: string };
    const { text } = z.object({ text: z.string().trim().min(1).max(4096) }).parse(request.body);
    const s = await ownedScheduledReply(request, suggestionId);
    if (!s) return reply.code(404).send({ error: 'Reply not found' });
    if (s.status !== 'approved' || s.sent_at) return reply.code(409).send({ error: 'This reply is no longer waiting to send' });
    await db.query(`UPDATE suggested_replies SET edited_text = $2, updated_at = NOW() WHERE id = $1`, [suggestionId, text]);
    return reply.send({ ok: true, text });
  });

  fastify.post('/api/zuri/scheduled/:suggestionId/cancel', { preHandler: authenticate }, async (request, reply) => {
    const { suggestionId } = request.params as { suggestionId: string };
    const s = await ownedScheduledReply(request, suggestionId);
    if (!s) return reply.code(404).send({ error: 'Reply not found' });
    if (s.status !== 'approved' || s.sent_at) return reply.code(409).send({ error: 'This reply is no longer waiting to send' });
    // The consumer re-checks status before sending, so this alone stops it.
    await db.query(`UPDATE suggested_replies SET status = 'dismissed', updated_at = NOW() WHERE id = $1`, [suggestionId]);
    const job = await queues.sendReply.getJob(jobIdFor(suggestionId));
    if (job && (await job.isDelayed())) await job.remove().catch(() => {});
    return reply.send({ ok: true });
  });

  // ════════════════════════════════ Person tab ════════════════════════════════

  // ── GET /api/contacts/:id/zuri/person ─────────────────────────────────────
  fastify.get('/api/contacts/:id/zuri/person', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const owned = await ownedContact(request, id);
    if (!owned) return reply.code(404).send({ error: 'Contact not found' });
    const uid = owned.user_id;

    const [base, stats, facts, lifeEvents, dates] = await Promise.all([
      db.query(
        `SELECT COALESCE(NULLIF(co.custom_name, ''), NULLIF(co.display_name, ''), '+' || co.phone_number) AS name,
                co.is_group, co.is_business, co.customer_status, co.pipeline_stage, co.lead_score,
                co.company, co.job_title, co.email, co.notes,
                COALESCE(r.relationship_type, 'acquaintance') AS relationship_type,
                cp.current_life_context, cp.personality_summary, cp.communication_style, cp.preferences, cp.goals,
                COALESCE(cp.user_edited_fields, '{}') AS user_edited_fields, cp.last_analyzed_at
         FROM contacts co
         LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = $2
         LEFT JOIN contact_profiles cp ON cp.contact_id = co.id AND cp.user_id = $2
         WHERE co.id = $1`,
        [id, uid],
      ),
      db.query(
        `SELECT MIN(m.whatsapp_timestamp) AS first_at, MAX(m.whatsapp_timestamp) AS last_at, COUNT(*)::int AS total
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
         WHERE c.contact_id = $1 AND c.user_id = $2 AND m.is_deleted = false`,
        [id, uid],
      ),
      db.query(
        `SELECT id, insight_key, insight_value, confidence, supporting_text
         FROM contact_insights
         WHERE contact_id = $1 AND user_id = $2 AND is_active = TRUE
         ORDER BY (insight_key = 'remember') DESC, confidence DESC NULLS LAST, created_at DESC
         LIMIT 30`,
        [id, uid],
      ),
      db.query(
        `SELECT id, event_type, title, event_date::text AS event_date, created_at
         FROM contact_life_events WHERE contact_id = $1 AND user_id = $2
         ORDER BY COALESCE(event_date, created_at::date) DESC LIMIT 12`,
        [id, uid],
      ),
      db.query(
        `SELECT id, event_type::text AS event_type, title, event_date::text AS event_date, is_recurring
         FROM events WHERE contact_id = $1 AND user_id = $2 AND event_date IS NOT NULL
           AND (event_type IN ('birthday', 'anniversary') OR event_date >= CURRENT_DATE)
         ORDER BY event_date ASC LIMIT 20`,
        [id, uid],
      ),
    ]);

    const p = base.rows[0];
    const isBusiness = Boolean(
      p.is_business || BUSINESS_RELATIONSHIPS.has(p.relationship_type) ||
      (p.customer_status && p.customer_status !== 'contact') || p.pipeline_stage || p.company,
    );

    // Same fact worded differently by successive profiler runs: show once.
    const seen: Set<string>[] = [];
    const factList = facts.rows.filter((f: any) => {
      const w = words(f.insight_value ?? '');
      if (seen.some(s2 => nearDuplicate(s2, w))) return false;
      seen.push(w);
      return true;
    }).map((f: any) => ({
      id: f.id, text: f.insight_value, mine: f.insight_key === 'remember',
      confidence: f.confidence !== null ? Number(f.confidence) : null, evidence: f.supporting_text,
    }));

    const occasions = dates.rows.map((e: any) => {
      const yearly = e.event_type === 'birthday' || e.event_type === 'anniversary' || e.is_recurring;
      const occ = yearly ? nextOccurrence(e.event_date) : {
        next: e.event_date,
        daysAway: Math.round((new Date(e.event_date + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000),
      };
      return { id: e.id, type: e.event_type, title: e.title, date: e.event_date, nextDate: occ.next, daysAway: occ.daysAway, yearly };
    }).filter((o: { daysAway: number }) => o.daysAway >= 0).sort((a: any, b: any) => a.daysAway - b.daysAway);

    return reply.send({
      person: { id, name: p.name, isGroup: p.is_group, relationshipType: p.relationship_type, isBusiness },
      stats: { firstMessageAt: stats.rows[0].first_at, lastMessageAt: stats.rows[0].last_at, totalMessages: stats.rows[0].total },
      about: {
        currentLifeContext: p.current_life_context, personalitySummary: p.personality_summary,
        communicationStyle: p.communication_style, preferences: p.preferences, goals: p.goals,
        userEditedFields: p.user_edited_fields, lastAnalyzedAt: p.last_analyzed_at,
      },
      facts: factList,
      lifeEvents: lifeEvents.rows.map((e: any) => ({ id: e.id, type: e.event_type, title: e.title, date: e.event_date })),
      occasions,
      notes: p.notes,
      business: isBusiness ? {
        company: p.company, jobTitle: p.job_title, email: p.email,
        customerStatus: p.customer_status, pipelineStage: p.pipeline_stage, leadScore: p.lead_score,
      } : null,
      relationshipTypes: RELATIONSHIP_TYPES,
    });
  });

  // ── POST /api/contacts/:id/zuri/relationship {type} ───────────────────────
  fastify.post('/api/contacts/:id/zuri/relationship', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { type } = z.object({ type: z.enum(RELATIONSHIP_TYPES) }).parse(request.body);
    const owned = await ownedContact(request, id);
    if (!owned) return reply.code(404).send({ error: 'Contact not found' });
    const { rowCount } = await db.query(
      `UPDATE relationships SET relationship_type = $3, updated_at = NOW() WHERE contact_id = $1 AND user_id = $2`,
      [id, owned.user_id, type],
    );
    if (!rowCount) {
      await db.query(
        `INSERT INTO relationships (user_id, contact_id, relationship_type) VALUES ($1, $2, $3)`,
        [owned.user_id, id, type],
      );
    }
    return reply.send({ ok: true, type });
  });

  // ── POST /api/contacts/:id/zuri/facts {text} — "remember this" ────────────
  fastify.post('/api/contacts/:id/zuri/facts', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { text } = z.object({ text: z.string().trim().min(2).max(500) }).parse(request.body);
    const owned = await ownedContact(request, id);
    if (!owned) return reply.code(404).send({ error: 'Contact not found' });
    const { rows: [f] } = await db.query(
      `INSERT INTO contact_insights (contact_id, user_id, insight_key, insight_value, confidence, supporting_text)
       VALUES ($1, $2, 'remember', $3, 1.0, 'Added by you') RETURNING id`,
      [id, owned.user_id, text],
    );
    return reply.code(201).send({ id: f.id, text, mine: true });
  });

  // ── POST /api/contacts/:id/zuri/facts/:factId/reject — "that's wrong" ─────
  // Learned facts are remembered as rejected so the profiler never re-adds
  // them; your own facts are simply removed.
  fastify.post('/api/contacts/:id/zuri/facts/:factId/reject', { preHandler: authenticate }, async (request, reply) => {
    const { id, factId } = request.params as { id: string; factId: string };
    const owned = await ownedContact(request, id);
    if (!owned) return reply.code(404).send({ error: 'Contact not found' });
    const { rowCount } = await db.query(
      `UPDATE contact_insights
       SET is_active = FALSE,
           rejected_at = CASE WHEN insight_key = 'remember' THEN rejected_at ELSE NOW() END
       WHERE id = $1 AND contact_id = $2 AND user_id = $3`,
      [factId, id, owned.user_id],
    );
    if (!rowCount) return reply.code(404).send({ error: 'Fact not found' });
    return reply.send({ ok: true });
  });

  // ── Important dates (birthday / anniversary) — yearly calendar events ─────
  fastify.post('/api/contacts/:id/zuri/dates', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { type, date } = z.object({
      type: z.enum(DATE_TYPES),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(request.body);
    const owned = await ownedContact(request, id);
    if (!owned) return reply.code(404).send({ error: 'Contact not found' });
    const { rows: [c] } = await db.query<{ name: string }>(
      `SELECT COALESCE(NULLIF(custom_name, ''), NULLIF(display_name, ''), 'Contact') AS name FROM contacts WHERE id = $1`, [id],
    );
    // One birthday / anniversary per person: replace any earlier one.
    await db.query(
      `DELETE FROM events WHERE contact_id = $1 AND user_id = $2 AND event_type = $3::event_type`,
      [id, owned.user_id, type],
    );
    const title = `${c.name}'s ${type}`;
    const { rows: [e] } = await db.query(
      `INSERT INTO events (user_id, contact_id, event_type, title, event_date, is_recurring, recurrence_rule, source, is_confirmed)
       VALUES ($1, $2, $3::event_type, $4, $5::date, TRUE, 'FREQ=YEARLY', 'user_input', TRUE) RETURNING id`,
      [owned.user_id, id, type, title, date],
    );
    return reply.code(201).send({ id: e.id });
  });

  fastify.delete('/api/contacts/:id/zuri/dates/:eventId', { preHandler: authenticate }, async (request, reply) => {
    const { id, eventId } = request.params as { id: string; eventId: string };
    const owned = await ownedContact(request, id);
    if (!owned) return reply.code(404).send({ error: 'Contact not found' });
    await db.query(`DELETE FROM events WHERE id = $1 AND contact_id = $2 AND user_id = $3`, [eventId, id, owned.user_id]);
    return reply.send({ ok: true });
  });

  // ── POST /api/contacts/:id/zuri/gift-ideas {occasion?, budget?} ───────────
  fastify.post('/api/contacts/:id/zuri/gift-ideas', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ occasion: z.string().max(120).optional(), budget: z.string().max(60).optional() }).parse(request.body ?? {});
    const owned = await ownedContact(request, id);
    if (!owned) return reply.code(404).send({ error: 'Contact not found' });
    try {
      const res = await fetch(`${INTELLIGENCE_URL}/internal/zuri-panel/contacts/${id}/gift-ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: owned.user_id, occasion: body.occasion, budget: body.budget }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) return reply.code(502).send({ error: 'Zuri could not come up with ideas right now' });
      return reply.send(await res.json());
    } catch {
      return reply.code(502).send({ error: 'Zuri could not come up with ideas right now' });
    }
  });


  // ════════════════════════════════ Media tab ═════════════════════════════════

  // ── GET /api/conversations/:id/zuri/media?kind=media|docs|audio|links&before= ─
  fastify.get('/api/conversations/:id/zuri/media', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const q = request.query as { kind?: string; before?: string };
    const kind = (['media', 'docs', 'audio', 'links'] as const).find(k => k === q.kind) ?? 'media';
    const before = q.before && !Number.isNaN(Date.parse(q.before)) ? new Date(q.before).toISOString() : null;
    const conv = await ownedConversation(request, id);
    if (!conv) return reply.code(404).send({ error: 'Conversation not found' });
    const PAGE = 60;

    const { rows: [counts] } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE message_type IN ('image', 'video') AND media_url IS NOT NULL)::int AS media,
         COUNT(*) FILTER (WHERE message_type = 'document' AND media_url IS NOT NULL)::int AS docs,
         COUNT(*) FILTER (WHERE message_type = 'audio' AND media_url IS NOT NULL)::int AS audio,
         COUNT(*) FILTER (WHERE body ~* 'https?://')::int AS links,
         COUNT(*) FILTER (WHERE message_type IN ('image', 'video', 'document', 'audio') AND media_url IS NULL)::int AS unavailable
       FROM messages WHERE conversation_id = $1 AND is_deleted = false`,
      [id],
    );

    let items: unknown[] = [];
    let nextBefore: string | null = null;
    if (kind === 'links') {
      const { rows } = await db.query(
        `SELECT m.id, m.sender_type, m.whatsapp_timestamp, m.body
         FROM messages m
         WHERE m.conversation_id = $1 AND m.is_deleted = false AND m.body ~* 'https?://'
           AND ($2::timestamptz IS NULL OR m.whatsapp_timestamp < $2::timestamptz)
         ORDER BY m.whatsapp_timestamp DESC LIMIT $3`,
        [id, before, PAGE],
      );
      if (rows.length >= PAGE) nextBefore = rows[rows.length - 1].whatsapp_timestamp;
      for (const r of rows) {
        for (const url of String(r.body).match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []) {
          items.push({ messageId: r.id, url: url.replace(/[.,;!?]+$/, ''), fromMe: r.sender_type === 'user', at: r.whatsapp_timestamp });
        }
      }
    } else {
      const types = kind === 'media' ? ['image', 'video'] : kind === 'docs' ? ['document'] : ['audio'];
      const { rows } = await db.query(
        `SELECT m.id, m.message_type, m.body, m.media_url, m.media_mime_type, m.transcription,
                m.sender_type, m.sender_display_name, m.whatsapp_timestamp
         FROM messages m
         WHERE m.conversation_id = $1 AND m.is_deleted = false AND m.media_url IS NOT NULL
           AND m.message_type = ANY($2::text[])
           AND ($3::timestamptz IS NULL OR m.whatsapp_timestamp < $3::timestamptz)
         ORDER BY m.whatsapp_timestamp DESC LIMIT $4`,
        [id, types, before, PAGE],
      );
      if (rows.length >= PAGE) nextBefore = rows[rows.length - 1].whatsapp_timestamp;
      items = rows.map((r: any) => ({
        messageId: r.id, type: r.message_type, caption: r.body, mediaUrl: r.media_url, mimeType: r.media_mime_type,
        transcription: r.transcription && r.transcription !== '[Audio voice message]' ? r.transcription : null,
        fromMe: r.sender_type === 'user', senderName: r.sender_display_name, at: r.whatsapp_timestamp,
      }));
    }

    return reply.send({ kind, counts, items, nextBefore });
  });

}
