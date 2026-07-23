import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../plugins/authenticate';
import { requireFeature } from '../lib/entitlements';

const gate = [authenticate, requireFeature('teams')];

const updateOrgBody = z.object({
  name: z.string().min(1).max(255).optional(),
  settings: z.record(z.any()).optional(),
});

const inviteMemberBody = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).default('member'),
  fullName: z.string().optional(),
});

const changeRoleBody = z.object({
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
});

const createTeamBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  leadUserId: z.string().uuid().optional(),
});

const teamMemberBody = z.object({
  userId: z.string().uuid(),
  role: z.string().default('member'),
});

export async function organizationRoutes(fastify: FastifyInstance): Promise<void> {
  // Helper: Resolve active organization & user's role
  async function getUserOrgContext(userId: string) {
    const { rows: [member] } = await db.query<{
      organization_id: string;
      role: string;
      status: string;
      org_name: string;
      clerk_org_id: string;
      max_seats: number;
    }>(
      `SELECT om.organization_id, om.role, om.status, o.name AS org_name, o.clerk_org_id, o.max_seats
       FROM organization_members om
       JOIN organizations o ON om.organization_id = o.id
       WHERE om.user_id = $1 AND om.status = 'active'
       LIMIT 1`,
      [userId],
    );
    return member || null;
  }

  // GET /api/organization/me — Get details of current user's organization
  fastify.get(
    '/api/organization/me',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const orgCtx = await getUserOrgContext(userId);

      if (!orgCtx) {
        return reply.send({ organization: null });
      }

      const { rows: [org] } = await db.query<{
        id: string;
        clerk_org_id: string;
        name: string;
        slug: string | null;
        logo_url: string | null;
        plan_family: string;
        max_seats: number;
        settings: any;
        created_at: string;
      }>(
        `SELECT id, clerk_org_id, name, slug, logo_url, plan_family, max_seats, settings, created_at
         FROM organizations WHERE id = $1`,
        [orgCtx.organization_id],
      );

      const { rows: [stats] } = await db.query<{
        total_members: string;
        active_teams: string;
      }>(
        `SELECT
           (SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND status = 'active') AS total_members,
           (SELECT COUNT(*) FROM organization_teams WHERE organization_id = $1) AS active_teams`,
        [orgCtx.organization_id],
      );

      return reply.send({
        organization: {
          id: org.id,
          clerkOrgId: org.clerk_org_id,
          name: org.name,
          slug: org.slug,
          logoUrl: org.logo_url,
          planFamily: org.plan_family,
          maxSeats: org.max_seats,
          settings: org.settings,
          createdAt: org.created_at,
          userRole: orgCtx.role,
          activeMembersCount: parseInt(stats?.total_members || '1', 10),
          activeTeamsCount: parseInt(stats?.active_teams || '0', 10),
        },
      });
    },
  );

  // PATCH /api/organization/me — Update company organization profile (owner/admin only)
  fastify.patch(
    '/api/organization/me',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const orgCtx = await getUserOrgContext(userId);

      if (!orgCtx || !['owner', 'admin'].includes(orgCtx.role)) {
        return reply.code(403).send({ error: 'Only organization owners or admins can update settings' });
      }

      const body = updateOrgBody.parse(request.body);
      const updates: string[] = ['updated_at = NOW()'];
      const values: any[] = [];
      let idx = 1;

      if (body.name) {
        updates.push(`name = $${idx++}`);
        values.push(body.name);
      }
      if (body.settings) {
        updates.push(`settings = $${idx++}`);
        values.push(JSON.stringify(body.settings));
      }

      values.push(orgCtx.organization_id);

      const { rows: [updated] } = await db.query<{ id: string; name: string; settings: any }>(
        `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name, settings`,
        values,
      );

      // Audit log
      await db.query(
        `INSERT INTO organization_audit_logs (organization_id, actor_user_id, action, metadata)
         VALUES ($1, $2, 'organization_updated', $3)`,
        [orgCtx.organization_id, userId, JSON.stringify({ name: body.name })],
      );

      return reply.send({ organization: updated });
    },
  );

  // GET /api/organization/members — Roster of company members
  fastify.get(
    '/api/organization/members',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const orgCtx = await getUserOrgContext(userId);

      if (!orgCtx) {
        return reply.code(403).send({ error: 'You do not belong to an active organization' });
      }

      const { rows: members } = await db.query<{
        id: string;
        user_id: string;
        role: string;
        status: string;
        joined_at: string;
        full_name: string;
        email: string;
        assigned_conversations_count: string;
      }>(
        `SELECT
           om.id,
           om.user_id,
           om.role,
           om.status,
           om.joined_at,
           u.full_name,
           u.email,
           (SELECT COUNT(*) FROM conversation_assignments ca WHERE ca.assigned_to = om.user_id) AS assigned_conversations_count
         FROM organization_members om
         JOIN users u ON om.user_id = u.id
         WHERE om.organization_id = $1 AND om.status != 'removed'
         ORDER BY om.role = 'owner' DESC, om.role = 'admin' DESC, om.joined_at ASC`,
        [orgCtx.organization_id],
      );

      return reply.send({
        members: members.map((m) => ({
          id: m.id,
          userId: m.user_id,
          role: m.role,
          status: m.status,
          joinedAt: m.joined_at,
          fullName: m.full_name,
          email: m.email,
          assignedConversationsCount: parseInt(m.assigned_conversations_count || '0', 10),
        })),
        maxSeats: orgCtx.max_seats,
      });
    },
  );

  // POST /api/organization/invite — Invite or add a member to the company org
  fastify.post(
    '/api/organization/invite',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const orgCtx = await getUserOrgContext(userId);

      if (!orgCtx || !['owner', 'admin'].includes(orgCtx.role)) {
        return reply.code(403).send({ error: 'Only owners or admins can invite new members' });
      }

      let body: z.infer<typeof inviteMemberBody>;
      try {
        body = inviteMemberBody.parse(request.body);
      } catch (err: any) {
        return reply.code(400).send({ error: 'Invalid request body', detail: err.message });
      }

      // Check max seats capacity
      const { rows: [seatInfo] } = await db.query<{ active_count: string }>(
        `SELECT COUNT(*) AS active_count FROM organization_members WHERE organization_id = $1 AND status = 'active'`,
        [orgCtx.organization_id],
      );

      if (parseInt(seatInfo?.active_count || '0', 10) >= orgCtx.max_seats) {
        return reply.code(402).send({
          error: `Company seat limit reached (${orgCtx.max_seats} max seats). Upgrade your business plan to add more seats.`,
        });
      }

      // Look up target user by email
      const { rows: [targetUser] } = await db.query<{ id: string; full_name: string; is_company_managed: boolean }>(
        `SELECT id, full_name, COALESCE(is_company_managed, false) AS is_company_managed FROM users WHERE email = $1`,
        [body.email],
      );

      let targetUserId = targetUser?.id;

      if (!targetUser) {
        // Create user record for pending member
        const { rows: [created] } = await db.query<{ id: string }>(
          `INSERT INTO users (email, full_name, mode, is_company_managed, onboarding_completed)
           VALUES ($1, $2, 'business', true, false)
           RETURNING id`,
          [body.email, body.fullName || body.email.split('@')[0]],
        );
        targetUserId = created.id;
      }

      // Upsert membership
      const { rows: [member] } = await db.query<{ id: string }>(
        `INSERT INTO organization_members (organization_id, user_id, role, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (organization_id, user_id) DO UPDATE SET
           role = EXCLUDED.role,
           status = 'active',
           updated_at = NOW()
         RETURNING id`,
        [orgCtx.organization_id, targetUserId, body.role],
      );

      // Lock target user to business mode and company managed
      await db.query(
        `UPDATE users SET current_organization_id = $1, is_company_managed = true, mode = 'business', updated_at = NOW() WHERE id = $2`,
        [orgCtx.organization_id, targetUserId],
      );

      // Log Audit Event
      await db.query(
        `INSERT INTO organization_audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
         VALUES ($1, $2, 'member_invited', 'user', $3, $4)`,
        [orgCtx.organization_id, userId, targetUserId, JSON.stringify({ email: body.email, role: body.role })],
      );

      return reply.code(201).send({
        memberId: member.id,
        message: `Member ${body.email} successfully added to company organization.`,
      });
    },
  );

  // PATCH /api/organization/members/:memberId — Update a member's role
  fastify.patch(
    '/api/organization/members/:memberId',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { memberId } = request.params as { memberId: string };
      const orgCtx = await getUserOrgContext(userId);

      if (!orgCtx || !['owner', 'admin'].includes(orgCtx.role)) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      const body = changeRoleBody.parse(request.body);

      const { rows: [updated] } = await db.query<{ id: string; role: string; user_id: string }>(
        `UPDATE organization_members
         SET role = $1, updated_at = NOW()
         WHERE id = $2 AND organization_id = $3
         RETURNING id, role, user_id`,
        [body.role, memberId, orgCtx.organization_id],
      );

      if (!updated) {
        return reply.code(404).send({ error: 'Organization member not found' });
      }

      await db.query(
        `INSERT INTO organization_audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
         VALUES ($1, $2, 'member_role_changed', 'user', $3, $4)`,
        [orgCtx.organization_id, userId, updated.user_id, JSON.stringify({ newRole: body.role })],
      );

      return reply.send({ memberId: updated.id, role: updated.role });
    },
  );

  // DELETE /api/organization/members/:memberId — Remove a member from the company organization
  fastify.delete(
    '/api/organization/members/:memberId',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { memberId } = request.params as { memberId: string };
      const orgCtx = await getUserOrgContext(userId);

      if (!orgCtx || !['owner', 'admin'].includes(orgCtx.role)) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      const { rows: [member] } = await db.query<{ id: string; user_id: string; role: string }>(
        `SELECT id, user_id, role FROM organization_members WHERE id = $1 AND organization_id = $2`,
        [memberId, orgCtx.organization_id],
      );

      if (!member) {
        return reply.code(404).send({ error: 'Member not found' });
      }

      if (member.role === 'owner') {
        return reply.code(400).send({ error: 'Cannot remove the organization owner' });
      }

      // Deactivate organization membership
      await db.query(
        `UPDATE organization_members SET status = 'removed', updated_at = NOW() WHERE id = $1`,
        [memberId],
      );

      // Unlock user from company governance and restore personal mode eligibility
      await db.query(
        `UPDATE users SET current_organization_id = NULL, is_company_managed = false, updated_at = NOW() WHERE id = $1`,
        [member.user_id],
      );

      await db.query(
        `INSERT INTO organization_audit_logs (organization_id, actor_user_id, action, target_type, target_id)
         VALUES ($1, $2, 'member_removed', 'user', $3)`,
        [orgCtx.organization_id, userId, member.user_id],
      );

      return reply.send({ ok: true, message: 'Member successfully removed from organization.' });
    },
  );

  // GET /api/organization/teams — Sub-teams / Departments list
  fastify.get(
    '/api/organization/teams',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const orgCtx = await getUserOrgContext(userId);

      if (!orgCtx) {
        return reply.code(403).send({ error: 'No active organization found' });
      }

      const { rows: teams } = await db.query<{
        id: string;
        name: string;
        description: string | null;
        lead_user_id: string | null;
        lead_name: string | null;
        member_count: string;
      }>(
        `SELECT
           ot.id,
           ot.name,
           ot.description,
           ot.lead_user_id,
           u.full_name AS lead_name,
           (SELECT COUNT(*) FROM organization_team_members otm WHERE otm.team_id = ot.id) AS member_count
         FROM organization_teams ot
         LEFT JOIN users u ON ot.lead_user_id = u.id
         WHERE ot.organization_id = $1
         ORDER BY ot.name ASC`,
        [orgCtx.organization_id],
      );

      return reply.send({
        teams: teams.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          leadUserId: t.lead_user_id,
          leadName: t.lead_name,
          memberCount: parseInt(t.member_count || '0', 10),
        })),
      });
    },
  );

  // POST /api/organization/teams — Create sub-team (e.g. Sales, Support)
  fastify.post(
    '/api/organization/teams',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const orgCtx = await getUserOrgContext(userId);

      if (!orgCtx || !['owner', 'admin'].includes(orgCtx.role)) {
        return reply.code(403).send({ error: 'Only owners or admins can create teams' });
      }

      const body = createTeamBody.parse(request.body);

      const { rows: [team] } = await db.query<{ id: string; name: string; description: string | null; created_at: string }>(
        `INSERT INTO organization_teams (organization_id, name, description, lead_user_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, description, created_at`,
        [orgCtx.organization_id, body.name, body.description ?? null, body.leadUserId ?? userId],
      );

      // Auto-add creator or lead to team
      await db.query(
        `INSERT INTO organization_team_members (team_id, user_id, role)
         VALUES ($1, $2, 'lead')
         ON CONFLICT DO NOTHING`,
        [team.id, body.leadUserId ?? userId],
      );

      return reply.code(201).send({ team });
    },
  );

  // GET /api/organization/audit-logs — Audit log feed
  fastify.get(
    '/api/organization/audit-logs',
    { preHandler: gate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const orgCtx = await getUserOrgContext(userId);

      if (!orgCtx || !['owner', 'admin'].includes(orgCtx.role)) {
        return reply.code(403).send({ error: 'Audit logs are restricted to organization owners and admins' });
      }

      const { rows: logs } = await db.query<{
        id: string;
        action: string;
        actor_name: string;
        target_type: string | null;
        metadata: any;
        created_at: string;
      }>(
        `SELECT
           oal.id,
           oal.action,
           u.full_name AS actor_name,
           oal.target_type,
           oal.metadata,
           oal.created_at
         FROM organization_audit_logs oal
         JOIN users u ON oal.actor_user_id = u.id
         WHERE oal.organization_id = $1
         ORDER BY oal.created_at DESC
         LIMIT 100`,
        [orgCtx.organization_id],
      );

      return reply.send({ logs });
    },
  );
}
