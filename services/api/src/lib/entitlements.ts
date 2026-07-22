import type { FastifyRequest, FastifyReply } from 'fastify'
import { db } from './db'

// Entitlement Engine (Membership Platform Phase 2, see
// docs/MEMBERSHIP_PLATFORM_PLAN.md §Phase 2). Free-tier-available surfaces
// (documents.ts, advisor.ts, contacts.ts, relationships.ts, goals.ts) are
// deliberately left ungated here — they're metered by the numeric daily
// caps (credits.py / the documents_remaining_today check in documents.ts)
// instead of a feature-area lock.

export const FEATURE_AREAS = [
  'career_os',
  'cv_studio',
  'job_search',
  'interview_coach',
  'advisor_companion',
  'business_os',
  'teams',
  'analytics',
  'automation',
  'enterprise_api',
] as const

export type FeatureArea = (typeof FEATURE_AREAS)[number]

export type PlanFamily = 'free' | 'personal' | 'professional' | 'business' | 'enterprise'

const PLAN_FAMILY_ORDER: PlanFamily[] = ['free', 'personal', 'professional', 'business', 'enterprise']

// While status='trialing', the effective family is hard-coded to 'business'
// regardless of the underlying (always 'free') plan_id — "all Premium
// features for 7 days," per the product brief, short of Enterprise's
// custom/unlimited framing.
const TRIAL_GRANTS_FAMILY: PlanFamily = 'business'

const PLAN_FEATURES: Record<PlanFamily, Set<FeatureArea>> = {
  free: new Set([]),
  personal: new Set(['career_os', 'cv_studio', 'job_search', 'interview_coach', 'advisor_companion']),
  professional: new Set([
    'career_os', 'cv_studio', 'job_search', 'interview_coach', 'advisor_companion',
    'business_os',
  ]),
  business: new Set([
    'career_os', 'cv_studio', 'job_search', 'interview_coach', 'advisor_companion',
    'business_os', 'teams', 'analytics', 'automation',
  ]),
  enterprise: new Set([
    'career_os', 'cv_studio', 'job_search', 'interview_coach', 'advisor_companion',
    'business_os', 'teams', 'analytics', 'automation', 'enterprise_api',
  ]),
}

function minimumFamilyFor(area: FeatureArea): PlanFamily {
  for (const family of PLAN_FAMILY_ORDER) {
    if (PLAN_FEATURES[family].has(area)) return family
  }
  return 'enterprise'
}

function isPlanFamily(value: string | null): value is PlanFamily {
  return !!value && (PLAN_FAMILY_ORDER as string[]).includes(value)
}

export async function getEffectivePlanFamily(userId: string): Promise<PlanFamily> {
  const { rows: [row] } = await db.query<{ status: string; plan_family: string | null }>(
    `SELECT s.status, p.plan_family
     FROM subscriptions s
     JOIN subscription_plans p ON p.id = s.plan_id
     WHERE s.user_id = $1`,
    [userId],
  )
  if (!row) return 'free'
  if (row.status === 'trialing') return TRIAL_GRANTS_FAMILY
  return isPlanFamily(row.plan_family) ? row.plan_family : 'free'
}

// Fastify preHandler factory mirroring requireMarketingAccess's exact shape.
// 402 (not 403) since this is a billing/upgrade gate, not a permissions one —
// the payload shape is what the frontend's contextual-upgrade UI (Phase 6)
// renders directly.
export function requireFeature(area: FeatureArea) {
  return async function requireFeatureHandler(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as { userId: string }
    const currentFamily = await getEffectivePlanFamily(userId)
    if (!PLAN_FEATURES[currentFamily].has(area)) {
      return reply.code(402).send({
        error: `This feature isn't available on your current plan.`,
        upgradeRequired: { feature: area, currentFamily, requiredFamily: minimumFamilyFor(area) },
      })
    }
  }
}

export function requireAnyFeature(areas: FeatureArea[]) {
  return async function requireAnyFeatureHandler(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as { userId: string }
    const currentFamily = await getEffectivePlanFamily(userId)
    const hasAny = areas.some((area) => PLAN_FEATURES[currentFamily].has(area))
    if (!hasAny) {
      return reply.code(402).send({
        error: `This feature isn't available on your current plan.`,
        upgradeRequired: { feature: areas[0], currentFamily, requiredFamily: minimumFamilyFor(areas[0]) },
      })
    }
  }
}

// Global mutation guard (registered once in app.ts, not per-route): once a
// subscription lapses into read_only (Phase 4), every mutating request is
// blocked except an explicit allowlist — GET/view/export/search always stay
// available, per the "never lock a user out of their own data" design
// principle. Runs its own best-effort JWT decode since a global preHandler
// hook executes before a route's own `authenticate` preHandler — an
// unauthenticated request is simply let through here and left for the
// route's own auth check to reject.
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const READ_ONLY_ALLOWLIST_PREFIXES = [
  '/api/auth',
  '/api/subscriptions',
  '/api/admin',
  '/api/webhooks',
  '/api/health',
]

export async function readOnlyModeGuard(request: FastifyRequest, reply: FastifyReply) {
  if (!MUTATION_METHODS.has(request.method)) return
  if (READ_ONLY_ALLOWLIST_PREFIXES.some((prefix) => request.url.startsWith(prefix))) return

  let userId: string | undefined
  try {
    await request.jwtVerify()
    userId = (request.user as { userId: string }).userId
  } catch {
    return
  }
  if (!userId) return

  const { rows: [sub] } = await db.query<{ status: string }>(
    `SELECT status FROM subscriptions WHERE user_id = $1`,
    [userId],
  )
  if (sub?.status === 'read_only') {
    return reply.code(402).send({
      error: 'Your subscription has lapsed. Renew to continue creating and generating — your existing data is always safe to view and export.',
      readOnly: true,
    })
  }
}
