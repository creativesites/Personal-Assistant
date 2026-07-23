import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { requireFeature } from '../lib/entitlements';
import { getEffectiveScope } from '../lib/org-scope';
import { publishInboxEvent } from '../lib/inbox-events';

const gate = [authenticate];

const createTeamBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

const inviteBody = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).default('member'),
});

const changeRoleBody = z.object({
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
});

const assignBody = z.object({
  assignedTo: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  expectedAssignedTo: z.string().uuid().nullable().optional(),
});

const noteBody = z.object({
  body: z.string().min(1),
  mentions: z.array(z.string().uuid()).optional(),
});

export async function teamRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/team — get the team/organization members
  fastify.get(
    '/api/team',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const scope = await getEffectiveScope(userId);

      if (!scope.isOrg || !scope.organizationId) {
        return reply.send({ team: null });
      }

      const { rows: [org] } = await db.query<{
        id: string;
        name: string;
        owner_user_id: string;
        created_at: string;
      }>(
        `SELECT id, name, owner_user_id, created_at FROM organizations WHERE id = $1`,
        [scope.organizationId],
      );

      if (!org) {
        return reply.send({ team: null });
      }

      const { rows: members } = await db.query<{
        id: string;
        user_id: string;
        role: string;
        invited_at: string | null;
        accepted_at: string | null;
        full_name: string;
        email: string;
      }>(
        `SELECT
          om.id,
          om.user_id,
          om.role,
          om.created_at AS invited_at,
          om.created_at AS accepted_at,
          COALESCE(u.full_name, u.email) AS full_name,
          u.email
        FROM organization_members om
        JOIN users u ON u.id = om.user_id
        WHERE om.organization_id = $1 AND om.status = 'active'
        ORDER BY om.created_at ASC`,
        [org.id],
      );

      return reply.send({
        team: {
          id: org.id,
          name: org.name,
          description: null,
          ownerUserId: org.owner_user_id,
          createdAt: org.created_at,
          members: members.map((m) => ({
            id: m.id,
            userId: m.user_id,
            role: m.role,
            invitedAt: m.invited_at,
            acceptedAt: m.accepted_at,
            fullName: m.full_name,
            email: m.email,
          })),
        },
      });
    },
  );

  // POST /api/team — legacy create team
  fastify.post(
    '/api/team',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      let body: z.infer<typeof createTeamBody>;
      try {
        body = createTeamBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      const { rows: [team] } = await db.query<{ id: string; name: string; description: string | null; created_at: string }>(
        `INSERT INTO teams (name, description, owner_user_id)
         VALUES ($1, $2, $3)
         RETURNING id, name, description, created_at`,
        [body.name, body.description ?? null, userId],
      );

      await db.query(
        `INSERT INTO team_members (team_id, user_id, role, invited_at, accepted_at)
         VALUES ($1, $2, 'owner', NOW(), NOW())`,
        [team.id, userId],
      );

      return reply.code(201).send({
        team: {
          id: team.id,
          name: team.name,
          description: team.description,
          ownerUserId: userId,
          createdAt: team.created_at,
        },
      });
    },
  );

  // GET /api/team/inbox — shared inbox
  fastify.get(
    '/api/team/inbox',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const scope = await getEffectiveScope(userId);

      const { rows } = await db.query(
        `SELECT
          c.id,
          c.last_message_at,
          c.last_message_preview,
          c.unread_count,
          COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS contact_name,
          co.avatar_url,
          ca.id AS assignment_id,
          ca.assigned_to,
          ca.team_id AS assigned_team_id,
          ca.locked_by,
          ca.locked_at,
          COALESCE(au.full_name, au.email) AS assigned_user_name,
          COALESCE(lu.full_name, lu.email) AS locked_user_name
        FROM conversations c
        JOIN contacts co ON co.id = c.contact_id
        LEFT JOIN conversation_assignments ca ON ca.conversation_id = c.id
        LEFT JOIN users au ON au.id = ca.assigned_to
        LEFT JOIN users lu ON lu.id = ca.locked_by
        WHERE (($1::uuid IS NOT NULL AND c.organization_id = $1::uuid) OR (c.user_id = $2::uuid OR c.user_id = $3::uuid))
        ORDER BY c.last_message_at DESC NULLS LAST
        LIMIT 100`,
        [scope.organizationId, scope.ownerUserId, userId],
      );

      return reply.send({
        conversations: rows.map((r: any) => ({
          id: r.id,
          lastMessageAt: r.last_message_at,
          lastMessagePreview: r.last_message_preview,
          unreadCount: r.unread_count,
          contact: {
            name: r.contact_name,
            avatarUrl: r.avatar_url,
          },
          assignment: r.assignment_id
            ? {
                id: r.assignment_id,
                assignedTo: r.assigned_to,
                assignedUserName: r.assigned_user_name,
                teamId: r.assigned_team_id,
                lockedBy: r.locked_by,
                lockedUserName: r.locked_user_name,
                lockedAt: r.locked_at,
              }
            : null,
        })),
      });
    },
  );

  // POST /api/conversations/:id/assign — assign a conversation with pessimistic locking
  fastify.post(
    '/api/conversations/:id/assign',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };
      const scope = await getEffectiveScope(userId);

      let body: z.infer<typeof assignBody>;
      try {
        body = assignBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      const client = await db.connect();
      try {
        await client.query('BEGIN');

        const { rows: [conv] } = await client.query(
          `SELECT id FROM conversations WHERE id = $1 AND (
             ($2::uuid IS NOT NULL AND organization_id = $2::uuid) OR
             (user_id = $3::uuid OR user_id = $4::uuid)
           )`,
          [id, scope.organizationId, scope.ownerUserId, userId],
        );
        if (!conv) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'Conversation not found' });
        }

        // Lock existing assignment row for update
        const { rows: [existing] } = await client.query<{
          assigned_to: string | null;
          locked_by: string | null;
          assigned_name: string | null;
          locked_name: string | null;
        }>(
          `SELECT
             ca.assigned_to,
             ca.locked_by,
             COALESCE(au.full_name, au.email) AS assigned_name,
             COALESCE(lu.full_name, lu.email) AS locked_name
           FROM conversation_assignments ca
           LEFT JOIN users au ON au.id = ca.assigned_to
           LEFT JOIN users lu ON lu.id = ca.locked_by
           WHERE ca.conversation_id = $1
           FOR UPDATE`,
          [id],
        );

        // Conflict Check 1: Conversation is locked by a different team member
        if (existing?.locked_by && existing.locked_by !== userId) {
          await client.query('ROLLBACK');
          return reply.code(409).send({
            error: 'Conversation is currently locked by another agent',
            lockedBy: existing.locked_by,
            lockedByName: existing.locked_name ?? 'Another team member',
          });
        }

        // Conflict Check 2: Optimistic concurrency check if expectedAssignedTo was supplied
        if (body.expectedAssignedTo !== undefined && existing?.assigned_to && existing.assigned_to !== body.expectedAssignedTo) {
          await client.query('ROLLBACK');
          return reply.code(409).send({
            error: 'Conversation assignment was modified by another agent',
            assignedTo: existing.assigned_to,
            assignedToName: existing.assigned_name ?? 'Another team member',
          });
        }

        const { rows: [assignment] } = await client.query<{ id: string }>(
          `INSERT INTO conversation_assignments (conversation_id, assigned_to, team_id, assigned_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (conversation_id) DO UPDATE
             SET assigned_to = EXCLUDED.assigned_to,
                 team_id = EXCLUDED.team_id,
                 assigned_by = EXCLUDED.assigned_by,
                 assigned_at = NOW()
           RETURNING id`,
          [id, body.assignedTo ?? null, body.teamId ?? null, userId],
        );

        await client.query('COMMIT');

        const { rows: [assigner] } = await db.query('SELECT COALESCE(full_name, email) AS name FROM users WHERE id = $1', [userId]);
        let assignedToName: string | null = null;
        let assignedToEmail: string | null = null;
        if (body.assignedTo) {
          const { rows: [assignee] } = await db.query('SELECT COALESCE(full_name, email) AS name, email FROM users WHERE id = $1', [body.assignedTo]);
          assignedToName = assignee?.name ?? null;
          assignedToEmail = assignee?.email ?? null;
        }
        const { rows: [contactRow] } = await db.query(
          `SELECT ct.name FROM conversations c JOIN contacts ct ON ct.id = c.contact_id WHERE c.id = $1`,
          [id]
        );

        const eventPayload = {
          conversationId: id,
          assignedTo: body.assignedTo ?? null,
          assignedToName,
          assignedToEmail,
          assignedBy: userId,
          assignedByName: assigner?.name ?? 'A team member',
          contactName: contactRow?.name ?? 'a customer',
        };

        await publishInboxEvent(scope.ownerUserId, 'conversation:assigned', eventPayload);
        if (userId !== scope.ownerUserId) {
          await publishInboxEvent(userId, 'conversation:assigned', eventPayload);
        }
        if (body.assignedTo && body.assignedTo !== scope.ownerUserId && body.assignedTo !== userId) {
          await publishInboxEvent(body.assignedTo, 'conversation:assigned', eventPayload);
        }

        return reply.send({ assignmentId: assignment.id, assignedToName });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  );

  // POST /api/conversations/:id/lock — lock a conversation for collision detection with pessimistic locking
  fastify.post(
    '/api/conversations/:id/lock',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };
      const scope = await getEffectiveScope(userId);

      const client = await db.connect();
      try {
        await client.query('BEGIN');

        const { rows: [conv] } = await client.query(
          `SELECT id FROM conversations WHERE id = $1 AND (
             ($2::uuid IS NOT NULL AND organization_id = $2::uuid) OR
             (user_id = $3::uuid OR user_id = $4::uuid)
           )`,
          [id, scope.organizationId, scope.ownerUserId, userId],
        );
        if (!conv) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'Conversation not found' });
        }

        const { rows: [assignment] } = await client.query<{
          locked_by: string | null;
          locked_name: string | null;
        }>(
          `SELECT ca.locked_by, COALESCE(lu.full_name, lu.email) AS locked_name
           FROM conversation_assignments ca
           LEFT JOIN users lu ON lu.id = ca.locked_by
           WHERE ca.conversation_id = $1
           FOR UPDATE`,
          [id],
        );

        if (assignment?.locked_by && assignment.locked_by !== userId) {
          await client.query('ROLLBACK');
          return reply.code(409).send({
            error: 'Conversation is locked',
            lockedBy: assignment.locked_by,
            lockedByName: assignment.locked_name ?? 'Another agent',
          });
        }

        await client.query(
          `INSERT INTO conversation_assignments (conversation_id, locked_by, locked_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (conversation_id) DO UPDATE
             SET locked_by = $2, locked_at = NOW()`,
          [id, userId],
        );

        await client.query('COMMIT');

        const { rows: [currentUser] } = await db.query('SELECT COALESCE(full_name, email) AS name FROM users WHERE id = $1', [userId]);

        const eventPayload = { conversationId: id, lockedBy: userId, lockedByName: currentUser?.name ?? 'An agent' };
        await publishInboxEvent(scope.ownerUserId, 'conversation:locked', eventPayload);
        if (userId !== scope.ownerUserId) {
          await publishInboxEvent(userId, 'conversation:locked', eventPayload);
        }

        return reply.send({ ok: true });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  );

  // POST /api/conversations/:id/unlock — unlock a conversation
  fastify.post(
    '/api/conversations/:id/unlock',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };
      const scope = await getEffectiveScope(userId);

      const { rows: [conv] } = await db.query(
        `SELECT id FROM conversations WHERE id = $1 AND (
           ($2::uuid IS NOT NULL AND organization_id = $2::uuid) OR
           (user_id = $3::uuid OR user_id = $4::uuid)
         )`,
        [id, scope.organizationId, scope.ownerUserId, userId],
      );
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

      await db.query(
        `UPDATE conversation_assignments
         SET locked_by = NULL, locked_at = NULL
         WHERE conversation_id = $1 AND (locked_by = $2 OR $3 = 'owner' OR $3 = 'admin')`,
        [id, userId, scope.role],
      );

      const eventPayload = { conversationId: id, unlockedBy: userId };
      await publishInboxEvent(scope.ownerUserId, 'conversation:unlocked', eventPayload);
      if (userId !== scope.ownerUserId) {
        await publishInboxEvent(userId, 'conversation:unlocked', eventPayload);
      }

      return reply.send({ ok: true });
    },
  );

  // GET /api/conversations/:id/notes — list internal notes
  fastify.get(
    '/api/conversations/:id/notes',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };
      const scope = await getEffectiveScope(userId);

      const { rows: [conv] } = await db.query(
        `SELECT id FROM conversations WHERE id = $1 AND (
           ($2::uuid IS NOT NULL AND organization_id = $2::uuid) OR
           (user_id = $3::uuid OR user_id = $4::uuid)
         )`,
        [id, scope.organizationId, scope.ownerUserId, userId],
      );
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

      const { rows } = await db.query(
        `SELECT
          n.id,
          n.body,
          n.mentions,
          n.created_at,
          COALESCE(u.full_name, u.email) AS author_name
        FROM conversation_notes n
        JOIN users u ON u.id = n.author_id
        WHERE n.conversation_id = $1
        ORDER BY n.created_at ASC`,
        [id],
      );

      return reply.send({
        notes: rows.map((n: any) => ({
          id: n.id,
          text: n.body,
          body: n.body,
          mentions: n.mentions,
          createdAt: n.created_at,
          author: n.author_name,
          authorName: n.author_name,
        })),
      });
    },
  );

  // POST /api/conversations/:id/notes — add internal note
  fastify.post(
    '/api/conversations/:id/notes',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };
      const scope = await getEffectiveScope(userId);

      let body: z.infer<typeof noteBody>;
      try {
        body = noteBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      const { rows: [conv] } = await db.query(
        `SELECT id FROM conversations WHERE id = $1 AND (
           ($2::uuid IS NOT NULL AND organization_id = $2::uuid) OR
           (user_id = $3::uuid OR user_id = $4::uuid)
         )`,
        [id, scope.organizationId, scope.ownerUserId, userId],
      );
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

      const { rows: [author] } = await db.query('SELECT COALESCE(full_name, email) AS name FROM users WHERE id = $1', [userId]);

      const { rows: [note] } = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO conversation_notes (conversation_id, author_id, body, mentions)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [id, userId, body.body, body.mentions ?? null],
      );

      const noteObject = {
        id: note.id,
        text: body.body,
        body: body.body,
        author: author?.name ?? 'An agent',
        authorName: author?.name ?? 'An agent',
        createdAt: note.created_at,
      };

      await publishInboxEvent(scope.ownerUserId, 'conversation:note_added', { conversationId: id, note: noteObject });
      if (userId !== scope.ownerUserId) {
        await publishInboxEvent(userId, 'conversation:note_added', { conversationId: id, note: noteObject });
      }

      return reply.code(201).send({ note: noteObject });
    },
  );
}

