import type { FastifyRequest, FastifyReply } from 'fastify';
import { getEffectiveScope, type EffectiveScope } from './org-scope';

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface RequestWithScope extends FastifyRequest {
  orgScope?: EffectiveScope;
}

/**
 * Middleware factory that enforces allowed organization roles.
 * Usage in Fastify route:
 * fastify.post('/api/organization/invite', { preHandler: [authenticate, requireOrgRole(['owner', 'admin'])] }, ...)
 */
export function requireOrgRole(allowedRoles: OrgRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = (request as any).user ?? {};
    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const scope = await getEffectiveScope(userId);
    (request as RequestWithScope).orgScope = scope;

    if (scope.isOrg && !allowedRoles.includes(scope.role)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Role '${scope.role}' does not have permission to perform this action. Required: ${allowedRoles.join(', ')}`,
      });
    }
  };
}

/**
 * Checks if the user's role permits writing/sending messages or modifying data.
 * Viewers are strictly read-only.
 */
export function requireWritePermission() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = (request as any).user ?? {};
    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const scope = await getEffectiveScope(userId);
    (request as RequestWithScope).orgScope = scope;

    if (scope.isOrg && scope.role === 'viewer') {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Viewers have read-only access and cannot modify data or send messages.',
      });
    }
  };
}
