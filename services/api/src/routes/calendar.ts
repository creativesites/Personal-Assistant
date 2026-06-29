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
          contact: r.contact_id
            ? { id: r.contact_id, name: r.contact_name, avatarUrl: r.contact_avatar ?? null }
            : undefined,
        };
      }),
    });
  });
}
