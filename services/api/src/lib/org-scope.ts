import { db } from './db';

export interface EffectiveScope {
  userId: string;
  organizationId: string | null;
  ownerUserId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  isCompanyManaged: boolean;
  isOrg: boolean;
}

/**
 * Resolves the effective workspace scope for a given user ID.
 * If the user belongs to an active organization (current_organization_id),
 * this returns the organization ID, the organization owner's user ID, and the user's role.
 */
export async function getEffectiveScope(userId: string): Promise<EffectiveScope> {
  const { rows: [user] } = await db.query(
    'SELECT id, current_organization_id, is_company_managed FROM users WHERE id = $1',
    [userId]
  );

  if (!user || !user.current_organization_id) {
    return {
      userId,
      organizationId: null,
      ownerUserId: userId,
      role: 'owner',
      isCompanyManaged: user?.is_company_managed ?? false,
      isOrg: false,
    };
  }

  const orgId = user.current_organization_id;

  const [memberRes, orgRes] = await Promise.all([
    db.query(
      'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = \'active\'',
      [orgId, userId]
    ),
    db.query(
      'SELECT owner_user_id FROM organizations WHERE id = $1',
      [orgId]
    ),
  ]);

  const memberRole = memberRes.rows[0]?.role ?? 'member';
  const ownerUserId = orgRes.rows[0]?.owner_user_id ?? userId;

  return {
    userId,
    organizationId: orgId,
    ownerUserId,
    role: memberRole,
    isCompanyManaged: true,
    isOrg: true,
  };
}

/**
 * Helper to construct SQL WHERE clause conditions and parameters for workspace scoping.
 * Example usage:
 * const scope = await getEffectiveScope(userId);
 * const { clause, params } = buildScopeWhere(scope, 'c');
 * query = `SELECT * FROM conversations c WHERE ${clause}`;
 */
export function buildScopeWhere(
  scope: EffectiveScope,
  tableAlias?: string,
  startParamIndex: number = 1
): { clause: string; params: any[]; nextParamIndex: number } {
  const prefix = tableAlias ? `${tableAlias}.` : '';

  if (scope.isOrg && scope.organizationId) {
    return {
      clause: `(${prefix}organization_id = $${startParamIndex} OR (${prefix}organization_id IS NULL AND ${prefix}user_id = $${startParamIndex + 1}))`,
      params: [scope.organizationId, scope.ownerUserId],
      nextParamIndex: startParamIndex + 2,
    };
  }

  return {
    clause: `${prefix}user_id = $${startParamIndex}`,
    params: [scope.userId],
    nextParamIndex: startParamIndex + 1,
  };
}
