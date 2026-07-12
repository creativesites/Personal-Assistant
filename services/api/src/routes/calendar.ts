import type { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';

export async function calendarRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/calendar/events ─────────────────────────────────────────────────
  // Returns all events from the `events` table for the current user, mapped to
  // the CalendarEvent shape expected by the calendar page.

  fastify.get('/api/calendar/events', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const { rows } = await db.query(
      `SELECT
         e.id,
         e.event_type,
         e.title,
         e.description,
         e.event_date::text      AS event_date,
         e.event_datetime,
         e.is_recurring,
         e.source,
         e.confidence_score,
         e.is_confirmed,
         COALESCE(co.custom_name, co.display_name, co.phone_number) AS contact_name,
         co.id      AS contact_id,
         co.avatar_url AS contact_avatar
       FROM events e
       LEFT JOIN contacts co ON co.id = e.contact_id
       WHERE e.user_id = $1
         AND (e.event_date IS NOT NULL OR e.event_datetime IS NOT NULL)
       ORDER BY COALESCE(e.event_date::date, e.event_datetime::date) ASC
       LIMIT 200`,
      [userId],
    );

    return reply.send({
      events: rows.map((r: any) => {
        // event_datetime takes priority; otherwise use event_date at midnight UTC
        const startDate: string = r.event_datetime
          ? new Date(r.event_datetime).toISOString()
          : `${r.event_date}T00:00:00.000Z`;

        return {
          id: r.id,
          title: r.title,
          description: r.description ?? null,
          startDate,
          endDate: null,
          allDay: !r.event_datetime,
          eventType: r.event_type,
          source: r.source === 'user_input' ? 'user' : 'ai_extracted',
          isConfirmed: r.is_confirmed,
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
    const { title, description, eventDate, eventDatetime, eventType, contactId, isRecurring } = request.body as {
      title: string;
      description?: string;
      eventDate?: string;
      eventDatetime?: string;
      eventType?: string;
      contactId?: string;
      isRecurring?: boolean;
    };

    if (!title?.trim()) {
      return reply.code(400).send({ error: 'Title is required' });
    }

    const { rows: [newEvent] } = await db.query(
      `INSERT INTO events (
         user_id, contact_id, event_type, title, description,
         event_date, event_datetime, is_recurring, source, is_confirmed, confidence_score
       ) VALUES (
         $1, $2, $3::event_type, $4, $5,
         $6, $7, $8, 'user_input', true, 1.0
       ) RETURNING id, event_type, title, description, event_date::text AS event_date, event_datetime, is_recurring, source, is_confirmed`,
      [
        userId,
        contactId || null,
        eventType || 'other',
        title.trim(),
        description || null,
        eventDate || null,
        eventDatetime || null,
        isRecurring || false
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
      ['isConfirmed', 'is_confirmed']
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
  // Deletes a calendar event
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
}
