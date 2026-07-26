import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';

export async function calendarRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/calendar/events ─────────────────────────────────────────────────
  // Returns unified timeline events from `events`, `contact_promises`, and `proactive_queue`
  fastify.get('/api/calendar/events', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    // 1. Standard Calendar Events
    const { rows: eventsRows } = await db.query(
      `SELECT
         e.id,
         e.event_type::text       AS item_kind,
         e.title,
         e.description,
         e.event_date::text      AS event_date,
         e.event_datetime,
         e.is_recurring,
         e.source::text          AS source,
         e.confidence_score,
         e.is_confirmed,
         e.send_wa_reminder,
         e.wa_reminder_offset_minutes,
         e.wa_reminder_status,
         COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
         co.id                   AS contact_id,
         co.avatar_url           AS contact_avatar,
         NULL::text              AS promise_status,
         NULL::text              AS promised_by
       FROM events e
       LEFT JOIN contacts co ON co.id = e.contact_id
       WHERE e.user_id = $1
         AND (e.event_date IS NOT NULL OR e.event_datetime IS NOT NULL)
       LIMIT 200`,
      [userId],
    );

    // 2. Tracked Customer & User Promises
    const { rows: promisesRows } = await db.query(
      `SELECT
         p.id,
         'promise'               AS item_kind,
         p.promise_text          AS title,
         CASE 
           WHEN p.promised_by = 'user' THEN 'Our Commitment to Client' 
           ELSE 'Client Commitment to Us' 
         END                     AS description,
         p.due_date::date::text  AS event_date,
         p.due_date              AS event_datetime,
         false                   AS is_recurring,
         'promise_tracker'       AS source,
         p.confidence            AS confidence_score,
         true                    AS is_confirmed,
         false                   AS send_wa_reminder,
         60                      AS wa_reminder_offset_minutes,
         'none'                  AS wa_reminder_status,
         COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
         co.id                   AS contact_id,
         co.avatar_url           AS contact_avatar,
         p.status                AS promise_status,
         p.promised_by           AS promised_by
       FROM contact_promises p
       LEFT JOIN contacts co ON co.id = p.contact_id
       WHERE p.user_id = $1
         AND p.due_date IS NOT NULL
         AND p.status != 'dismissed'
       LIMIT 200`,
      [userId],
    );

    // Combine & Sort
    const allItems = [...eventsRows, ...promisesRows].sort((a, b) => {
      const timeA = new Date(a.event_datetime || `${a.event_date}T00:00:00Z`).getTime();
      const timeB = new Date(b.event_datetime || `${b.event_date}T00:00:00Z`).getTime();
      return timeA - timeB;
    });

    return reply.send({
      events: allItems.map((r: any) => {
        const startDate: string = r.event_datetime
          ? new Date(r.event_datetime).toISOString()
          : `${r.event_date}T00:00:00.000Z`;

        const isOverdue = r.item_kind === 'promise' 
          ? r.promise_status === 'pending' && new Date(startDate).getTime() < Date.now()
          : false;

        return {
          id: r.id,
          title: r.title,
          description: r.description ?? null,
          startDate,
          endDate: null,
          allDay: !r.event_datetime,
          eventType: r.item_kind,
          source: r.source === 'user_input' ? 'user' : r.source === 'promise_tracker' ? 'promise_tracker' : 'ai_extracted',
          isConfirmed: r.is_confirmed,
          promiseStatus: r.promise_status,
          promisedBy: r.promised_by,
          isOverdue,
          sendWaReminder: r.send_wa_reminder ?? false,
          waReminderOffsetMinutes: r.wa_reminder_offset_minutes ?? 60,
          waReminderStatus: r.wa_reminder_status ?? 'none',
          contact: r.contact_id
            ? { id: r.contact_id, name: r.contact_name, avatarUrl: r.contact_avatar ?? null }
            : undefined,
        };
      }),
    });
  });

  // ── POST /api/calendar/events ────────────────────────────────────────────────
  // Creates a manually entered calendar event
  fastify.post('/api/calendar/events', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { 
      title, description, eventDate, eventDatetime, eventType, contactId, isRecurring,
      sendWaReminder, waReminderOffsetMinutes 
    } = request.body as {
      title: string;
      description?: string;
      eventDate?: string;
      eventDatetime?: string;
      eventType?: string;
      contactId?: string;
      isRecurring?: boolean;
      sendWaReminder?: boolean;
      waReminderOffsetMinutes?: number;
    };

    if (!title?.trim()) {
      return reply.code(400).send({ error: 'Title is required' });
    }

    const { rows: [newEvent] } = await db.query(
      `INSERT INTO events (
         user_id, contact_id, event_type, title, description,
         event_date, event_datetime, is_recurring, source, is_confirmed, confidence_score,
         send_wa_reminder, wa_reminder_offset_minutes, wa_reminder_status
       ) VALUES (
         $1, $2, $3::event_type, $4, $5,
         $6, $7, $8, 'user_input', true, 1.0,
         $9, $10, $11
       ) RETURNING id, event_type, title, description, event_date::text AS event_date, event_datetime, is_recurring, source, is_confirmed, send_wa_reminder, wa_reminder_offset_minutes, wa_reminder_status`,
      [
        userId,
        contactId || null,
        eventType || 'other',
        title.trim(),
        description || null,
        eventDate || null,
        eventDatetime || null,
        isRecurring || false,
        sendWaReminder || false,
        waReminderOffsetMinutes || 60,
        sendWaReminder ? 'scheduled' : 'none'
      ]
    );

    return reply.send({ event: newEvent });
  });

  // ── PATCH /api/calendar/events/:id ───────────────────────────────────────────
  // Updates event details or confirms an AI suggested event
  fastify.patch('/api/calendar/events/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    // Verify ownership
    const { rows: [existing] } = await db.query('SELECT id FROM events WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!existing) {
      return reply.code(404).send({ error: 'Event not found' });
    }

    const updates: string[] = [];
    const params: any[] = [id, userId];
    let index = 3;

    const fields = [
      ['title', 'title'],
      ['description', 'description'],
      ['eventDate', 'event_date'],
      ['eventDatetime', 'event_datetime'],
      ['eventType', 'event_type'],
      ['contactId', 'contact_id'],
      ['isRecurring', 'is_recurring'],
      ['isConfirmed', 'is_confirmed'],
      ['sendWaReminder', 'send_wa_reminder'],
      ['waReminderOffsetMinutes', 'wa_reminder_offset_minutes'],
      ['waReminderStatus', 'wa_reminder_status']
    ];

    for (const [key, dbCol] of fields) {
      if (body[key] !== undefined) {
        if (dbCol === 'event_type') {
          updates.push(`${dbCol} = $${index}::event_type`);
        } else {
          updates.push(`${dbCol} = $${index}`);
        }
        params.push(body[key]);
        index++;
      }
    }

    if (updates.length === 0) {
      return reply.send({ success: false, message: 'No fields to update' });
    }

    await db.query(
      `UPDATE events
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      params
    );

    return reply.send({ success: true });
  });

  // ── DELETE /api/calendar/events/:id ─────────────────────────────────────────
  fastify.delete('/api/calendar/events/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rowCount } = await db.query(
      'DELETE FROM events WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (rowCount === 0) {
      return reply.code(404).send({ error: 'Event not found' });
    }

    return reply.send({ success: true });
  });

  // ── PROMISES ENDPOINTS ────────────────────────────────────────────────────────

  // POST /api/calendar/promises — Create/track new promise
  fastify.post('/api/calendar/promises', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { contactId, conversationId, sourceMessageId, promiseText, promisedBy, dueDate } = request.body as {
      contactId: string;
      conversationId?: string;
      sourceMessageId?: string;
      promiseText: string;
      promisedBy?: 'user' | 'contact';
      dueDate?: string;
    };

    if (!promiseText?.trim() || !contactId) {
      return reply.code(400).send({ error: 'Contact ID and Promise text are required' });
    }

    const { rows: [promise] } = await db.query(
      `INSERT INTO contact_promises (
         user_id, contact_id, conversation_id, source_message_id,
         promise_text, promised_by, due_date, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [
        userId,
        contactId,
        conversationId || null,
        sourceMessageId || null,
        promiseText.trim(),
        promisedBy || 'user',
        dueDate || new Date(Date.now() + 86400000).toISOString()
      ]
    );

    return reply.send({ promise });
  });

  // PATCH /api/calendar/promises/:id/fulfill — Mark promise fulfilled
  fastify.patch('/api/calendar/promises/:id/fulfill', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rowCount } = await db.query(
      `UPDATE contact_promises
       SET status = 'fulfilled', updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (rowCount === 0) {
      return reply.code(404).send({ error: 'Promise not found' });
    }

    return reply.send({ success: true });
  });

  // DELETE /api/calendar/promises/:id — Dismiss promise
  fastify.delete('/api/calendar/promises/:id', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const { rowCount } = await db.query(
      `UPDATE contact_promises
       SET status = 'dismissed', updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (rowCount === 0) {
      return reply.code(404).send({ error: 'Promise not found' });
    }

    return reply.send({ success: true });
  });
}
