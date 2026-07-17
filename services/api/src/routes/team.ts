import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { requireFeature } from '../lib/entitlements'

const gate = [authenticate, requireFeature('teams')]

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
  assignedTo: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
});

const noteBody = z.object({
  body: z.string().min(1),
  mentions: z.array(z.string().uuid()).optional(),
});

export async function teamRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/team — get the team the current user belongs to, with all members
  fastify.get(
    '/api/team',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      // Find the team this user is a member of
      const { rows: [membership] } = await db.query<{ team_id: string }>(
        `SELECT team_id FROM team_members WHERE user_id = $1 AND accepted_at IS NOT NULL LIMIT 1`,
        [userId],
      );

      if (!membership) {
        return reply.send({ team: null });
      }

      const { rows: [team] } = await db.query<{
        id: string;
        name: string;
        description: string | null;
        owner_user_id: string;
        created_at: string;
      }>(
        `SELECT id, name, description, owner_user_id, created_at FROM teams WHERE id = $1`,
        [membership.team_id],
      );

      if (!team) {
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
          tm.id,
          tm.user_id,
          tm.role,
          tm.invited_at,
          tm.accepted_at,
          u.full_name,
          u.email
        FROM team_members tm
        JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = $1
        ORDER BY tm.accepted_at ASC NULLS LAST, tm.invited_at ASC`,
        [team.id],
      );

      return reply.send({
        team: {
          id: team.id,
          name: team.name,
          description: team.description,
          ownerUserId: team.owner_user_id,
          createdAt: team.created_at,
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

  // POST /api/team — create a new team; creator becomes owner
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

  // POST /api/team/invite — invite a user by email
  fastify.post(
    '/api/team/invite',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      let body: z.infer<typeof inviteBody>;
      try {
        body = inviteBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      // Verify the requester owns or admins a team
      const { rows: [requesterMembership] } = await db.query<{ team_id: string; role: string }>(
        `SELECT team_id, role FROM team_members WHERE user_id = $1 AND accepted_at IS NOT NULL LIMIT 1`,
        [userId],
      );
      if (!requesterMembership || !['owner', 'admin'].includes(requesterMembership.role)) {
        return reply.code(403).send({ error: 'You must be a team owner or admin to invite members' });
      }

      // Look up invitee by email
      const { rows: [invitee] } = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1`,
        [body.email],
      );
      if (!invitee) {
        return reply.code(404).send({ error: 'No user found with that email' });
      }

      // Check not already a member
      const { rows: [existing] } = await db.query(
        `SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2`,
        [requesterMembership.team_id, invitee.id],
      );
      if (existing) {
        return reply.code(409).send({ error: 'User is already a member of this team' });
      }

      const { rows: [member] } = await db.query<{ id: string }>(
        `INSERT INTO team_members (team_id, user_id, role, invited_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id`,
        [requesterMembership.team_id, invitee.id, body.role],
      );

      return reply.code(201).send({ memberId: member.id, message: 'Invite sent' });
    },
  );

  // PATCH /api/team/members/:memberId — change a member's role
  fastify.patch(
    '/api/team/members/:memberId',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { memberId } = request.params as { memberId: string };

      let body: z.infer<typeof changeRoleBody>;
      try {
        body = changeRoleBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      // Requester must be owner/admin on the same team
      const { rows: [requester] } = await db.query<{ team_id: string; role: string }>(
        `SELECT team_id, role FROM team_members WHERE user_id = $1 AND accepted_at IS NOT NULL LIMIT 1`,
        [userId],
      );
      if (!requester || !['owner', 'admin'].includes(requester.role)) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      const { rows: [updated] } = await db.query<{ id: string; role: string }>(
        `UPDATE team_members SET role = $1
         WHERE id = $2 AND team_id = $3
         RETURNING id, role`,
        [body.role, memberId, requester.team_id],
      );
      if (!updated) {
        return reply.code(404).send({ error: 'Team member not found' });
      }

      return reply.send({ memberId: updated.id, role: updated.role });
    },
  );

  // DELETE /api/team/members/:memberId — remove a member
  fastify.delete(
    '/api/team/members/:memberId',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { memberId } = request.params as { memberId: string };

      const { rows: [requester] } = await db.query<{ team_id: string; role: string }>(
        `SELECT team_id, role FROM team_members WHERE user_id = $1 AND accepted_at IS NOT NULL LIMIT 1`,
        [userId],
      );
      if (!requester || !['owner', 'admin'].includes(requester.role)) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      const { rowCount } = await db.query(
        `DELETE FROM team_members WHERE id = $1 AND team_id = $2`,
        [memberId, requester.team_id],
      );
      if (!rowCount) {
        return reply.code(404).send({ error: 'Team member not found' });
      }

      return reply.send({ ok: true });
    },
  );

  // PATCH /api/team/accept — accept a pending invite for the current user
  fastify.patch(
    '/api/team/accept',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const { rows: [member] } = await db.query<{ id: string; team_id: string }>(
        `UPDATE team_members
         SET accepted_at = NOW()
         WHERE user_id = $1 AND accepted_at IS NULL
         RETURNING id, team_id`,
        [userId],
      );
      if (!member) {
        return reply.code(404).send({ error: 'No pending invite found' });
      }

      return reply.send({ ok: true, teamId: member.team_id });
    },
  );

  // GET /api/team/inbox — shared inbox: conversations with assignment info
  fastify.get(
    '/api/team/inbox',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };

      const { rows: [membership] } = await db.query<{ team_id: string }>(
        `SELECT team_id FROM team_members WHERE user_id = $1 AND accepted_at IS NOT NULL LIMIT 1`,
        [userId],
      );
      if (!membership) {
        return reply.code(403).send({ error: 'You are not part of a team' });
      }

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
          au.full_name AS assigned_user_name
        FROM conversations c
        JOIN contacts co ON co.id = c.contact_id
        LEFT JOIN conversation_assignments ca ON ca.conversation_id = c.id
        LEFT JOIN users au ON au.id = ca.assigned_to
        WHERE ca.team_id = $1
        ORDER BY c.last_message_at DESC NULLS LAST
        LIMIT 100`,
        [membership.team_id],
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
                lockedAt: r.locked_at,
              }
            : null,
        })),
      });
    },
  );

  // POST /api/conversations/:id/assign — assign a conversation to a member/team
  fastify.post(
    '/api/conversations/:id/assign',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      let body: z.infer<typeof assignBody>;
      try {
        body = assignBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      // Verify conversation belongs to user
      const { rows: [conv] } = await db.query(
        `SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

      const { rows: [assignment] } = await db.query<{ id: string }>(
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

      return reply.send({ assignmentId: assignment.id });
    },
  );

  // POST /api/conversations/:id/lock — lock a conversation for the current user
  fastify.post(
    '/api/conversations/:id/lock',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      const { rows: [conv] } = await db.query(
        `SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

      const { rows: [assignment] } = await db.query<{ locked_by: string | null }>(
        `SELECT locked_by FROM conversation_assignments WHERE conversation_id = $1`,
        [id],
      );

      if (assignment?.locked_by && assignment.locked_by !== userId) {
        return reply.code(409).send({ error: 'Conversation is already locked by another user' });
      }

      await db.query(
        `INSERT INTO conversation_assignments (conversation_id, locked_by, locked_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (conversation_id) DO UPDATE
           SET locked_by = $2, locked_at = NOW()`,
        [id, userId],
      );

      return reply.send({ ok: true });
    },
  );

  // POST /api/conversations/:id/unlock — unlock a conversation (only if locked by current user)
  fastify.post(
    '/api/conversations/:id/unlock',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      const { rows: [conv] } = await db.query(
        `SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

      const { rowCount } = await db.query(
        `UPDATE conversation_assignments
         SET locked_by = NULL, locked_at = NULL
         WHERE conversation_id = $1 AND locked_by = $2`,
        [id, userId],
      );

      if (!rowCount) {
        return reply.code(403).send({ error: 'Conversation is not locked by you' });
      }

      return reply.send({ ok: true });
    },
  );

  // GET /api/conversations/:id/notes — list internal notes for a conversation
  fastify.get(
    '/api/conversations/:id/notes',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      const { rows: [conv] } = await db.query(
        `SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

      const { rows } = await db.query(
        `SELECT
          n.id,
          n.body,
          n.mentions,
          n.created_at,
          u.full_name AS author_name
        FROM conversation_notes n
        JOIN users u ON u.id = n.author_id
        WHERE n.conversation_id = $1
        ORDER BY n.created_at ASC`,
        [id],
      );

      return reply.send({
        notes: rows.map((n: any) => ({
          id: n.id,
          body: n.body,
          mentions: n.mentions,
          createdAt: n.created_at,
          authorName: n.author_name,
        })),
      });
    },
  );

  // POST /api/conversations/:id/notes — add an internal note
  fastify.post(
    '/api/conversations/:id/notes',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { id } = request.params as { id: string };

      let body: z.infer<typeof noteBody>;
      try {
        body = noteBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      const { rows: [conv] } = await db.query(
        `SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });

      const { rows: [note] } = await db.query<{ id: string; created_at: string }>(
        `INSERT INTO conversation_notes (conversation_id, author_id, body, mentions)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [id, userId, body.body, body.mentions ?? null],
      );

      return reply.code(201).send({ note: { id: note.id, createdAt: note.created_at } });
    },
  );
}
