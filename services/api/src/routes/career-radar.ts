import type { FastifyInstance } from 'fastify'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireFeature } from '../lib/entitlements'

const gate = [authenticate, requireFeature('job_search')]

// Zuri Career & Growth Engine, Phase 7 — Career Radar (see
// docs/CAREER_GROWTH_ENGINE_PLAN.md §12). A 0-100 composite score computed
// on read, same judgment as the Intelligence Health Score and Studio's
// Customer tiers — a handful of aggregate queries per page load, not a hot
// path needing a cached column. Each sub-score renders with its own
// one-line "why" and a concrete next action, never a bare number, matching
// the Confidence-and-Evidence discipline every other score in this
// codebase already carries.
//
// Two sub-scores are deliberately simplified from the plan's own fuller
// vision, in keeping with this codebase's "ship a real slice, document the
// rest" discipline: Skills measures list completeness (how filled-out the
// profile's skills array is), not true relevance-to-target-role matching
// (which needs a cached AI skill-extraction pass per role title — real
// scope, not built here). Market Demand and Visibility are the plan's own
// named Phase 1 proxies, not real external labor-market/activity signals.

interface SubScore {
  key: string
  label: string
  score: number
  why: string
  nextAction: string
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

export async function careerRadarRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/career/radar', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    const [
      profileResult, networkResult, portfolioResult, interviewResult, opportunityResult,
    ] = await Promise.all([
      db.query(
        `SELECT skills, target_roles, target_industries, github_url, linkedin_url, portfolio_url
         FROM career_profiles WHERE user_id = $1`,
        [userId],
      ),
      db.query(
        `SELECT AVG(r.health_score) AS avg_health,
                COUNT(*) FILTER (WHERE (r.career_signals->>'isRecruiter')::boolean
                                    OR (r.career_signals->>'isHiringManager')::boolean
                                    OR (r.career_signals->>'canReferLikely')::boolean) AS useful_count
         FROM relationships r JOIN contacts c ON c.id = r.contact_id
         WHERE r.user_id = $1 AND (c.job_title IS NOT NULL OR c.company IS NOT NULL)`,
        [userId],
      ),
      db.query(
        `SELECT COUNT(*) FILTER (WHERE document_type = 'resume') AS resume_count,
                COUNT(*) FILTER (WHERE document_type = 'portfolio_page') AS portfolio_page_count,
                MAX(updated_at) AS last_updated
         FROM documents WHERE user_id = $1 AND document_type IN ('resume', 'portfolio_page')`,
        [userId],
      ),
      db.query(
        `SELECT outcome, created_at FROM career_interviews WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      ),
      // Career & Growth Engine Phase 8 (§13) — the employer taxonomy join
      // lets an opportunity at a known bank/telecom/mining/etc. employer
      // count as a target-industry match even when the title/category text
      // itself doesn't literally mention that industry.
      db.query(
        `SELECT DISTINCT ON (co.id) co.id, co.title, co.category, cec.category AS employer_category
         FROM career_opportunities co
         LEFT JOIN career_employer_categories cec
           ON co.company_or_org ILIKE '%' || cec.employer_name || '%'
           OR EXISTS (SELECT 1 FROM unnest(cec.aliases) a WHERE co.company_or_org ILIKE '%' || a || '%')
         WHERE co.user_id = $1 AND co.created_at > NOW() - INTERVAL '90 days'
         ORDER BY co.id`,
        [userId],
      ),
    ])

    const profile = profileResult.rows[0] ?? null
    const skills: string[] = profile?.skills?.map((s: any) => (typeof s === 'string' ? s : s?.name)).filter(Boolean) ?? []
    const targetRoles: string[] = profile?.target_roles ?? []
    const targetIndustries: string[] = profile?.target_industries ?? []

    // ── Network ──────────────────────────────────────────────────────────
    const avgHealth = networkResult.rows[0]?.avg_health != null ? parseFloat(networkResult.rows[0].avg_health) : 40
    const usefulCount = Number(networkResult.rows[0]?.useful_count ?? 0)
    const networkScore = clamp(avgHealth * 0.8 + Math.min(20, usefulCount * 5))

    // ── Skills (list completeness, see file header) ─────────────────────
    const skillsScore = clamp(skills.length * 12)

    // ── Portfolio ────────────────────────────────────────────────────────
    const resumeCount = Number(portfolioResult.rows[0]?.resume_count ?? 0)
    const portfolioPageCount = Number(portfolioResult.rows[0]?.portfolio_page_count ?? 0)
    const hasExternalLinks = !!(profile?.github_url || profile?.portfolio_url || profile?.linkedin_url)
    const portfolioLastUpdated: Date | null = portfolioResult.rows[0]?.last_updated ?? null
    const portfolioRecentDays = portfolioLastUpdated
      ? Math.floor((Date.now() - new Date(portfolioLastUpdated).getTime()) / 86400000) : null
    const portfolioScore = clamp(
      (resumeCount > 0 ? 40 : 0) + (portfolioPageCount > 0 ? 20 : 0)
      + (hasExternalLinks ? 20 : 0) + (portfolioRecentDays !== null && portfolioRecentDays <= 30 ? 20 : 0),
    )

    // ── Interview Readiness ──────────────────────────────────────────────
    const interviews = interviewResult.rows
    const OUTCOME_SCORE: Record<string, number> = { passed: 100, pending: 55, withdrawn: 40, failed: 20 }
    const interviewScore = interviews.length === 0 ? 0 : clamp(
      interviews.reduce((sum: number, r: any) => sum + (OUTCOME_SCORE[r.outcome] ?? 50), 0) / interviews.length
      - (Math.floor((Date.now() - new Date(interviews[0].created_at).getTime()) / 86400000) > 90 ? 10 : 0),
    )

    // ── Market Demand (Phase 1 proxy — see file header) ─────────────────
    const roleTerms = [...targetRoles, ...targetIndustries].map(s => s.toLowerCase())
    const matchingOpportunities = roleTerms.length === 0 ? opportunityResult.rows.length : opportunityResult.rows.filter((o: any) =>
      roleTerms.some(term =>
        o.title?.toLowerCase().includes(term) || o.category?.toLowerCase().includes(term)
        || (o.employer_category && (term.includes(o.employer_category) || o.employer_category.includes(term))),
      ),
    ).length
    const marketDemandScore = clamp(matchingOpportunities * 20)

    // ── Visibility (Phase 1 proxy — see file header) ────────────────────
    let visibilityScore: number
    if (portfolioRecentDays === null && !hasExternalLinks) visibilityScore = 10
    else if (portfolioRecentDays !== null && portfolioRecentDays <= 30) visibilityScore = 100
    else if (portfolioRecentDays !== null && portfolioRecentDays <= 90) visibilityScore = 70
    else if (portfolioRecentDays !== null && portfolioRecentDays <= 180) visibilityScore = 40
    else visibilityScore = hasExternalLinks ? 30 : 20

    const subScores: SubScore[] = [
      {
        key: 'network', label: 'Network', score: networkScore,
        why: usefulCount > 0
          ? `${usefulCount} contact(s) flagged as a recruiter/hiring manager/likely referrer, averaging ${Math.round(avgHealth)}% relationship health.`
          : `Average health of your professional contacts is ${Math.round(avgHealth)}% — no recruiters/hiring managers/referrers identified yet.`,
        nextAction: usefulCount > 0
          ? 'Keep those relationships warm — a well-timed check-in goes further than a cold application.'
          : 'Add job titles/companies to more contacts so Zuri can spot recruiters and hiring managers in your network.',
      },
      {
        key: 'skills', label: 'Skills', score: skillsScore,
        why: skills.length > 0
          ? `${skills.length} skill(s) listed on your career profile.`
          : 'No skills listed on your career profile yet.',
        nextAction: skills.length < 8 ? 'Add more skills to your career profile — aim for at least 8-10.' : 'Your skills list is solid — keep it current as you grow.',
      },
      {
        key: 'portfolio', label: 'Portfolio', score: portfolioScore,
        why: resumeCount > 0
          ? `${resumeCount} resume(s) on file${portfolioRecentDays !== null ? `, last updated ${portfolioRecentDays} day(s) ago` : ''}.`
          : 'No resume generated or uploaded yet.',
        nextAction: resumeCount === 0 ? 'Generate or upload a resume in Resume Studio.' : !hasExternalLinks ? 'Add your GitHub/LinkedIn/portfolio URL to your career profile.' : 'Keep your resume fresh as your experience grows.',
      },
      {
        key: 'interviewReadiness', label: 'Interview Readiness', score: interviewScore,
        why: interviews.length > 0
          ? `${interviews.length} interview round(s) logged.`
          : 'No interview rounds logged yet.',
        nextAction: interviews.length === 0 ? "Log interview rounds as they happen — Zuri builds a 'what this company tends to ask' memory from them." : 'Review past rounds before your next one — check the interview-patterns lookup for this company.',
      },
      {
        key: 'marketDemand', label: 'Market Demand', score: marketDemandScore,
        why: `${matchingOpportunities} matching opportunity(ies) detected in the last 90 days.`,
        nextAction: matchingOpportunities === 0 ? 'Set your target roles/industries on your career profile so Zuri can flag more matches.' : 'Opportunities matching your targets are flowing in — keep your profile current.',
      },
      {
        key: 'visibility', label: 'Visibility', score: visibilityScore,
        why: portfolioRecentDays !== null
          ? `Portfolio/resume last touched ${portfolioRecentDays} day(s) ago.`
          : 'No portfolio or resume activity yet.',
        nextAction: visibilityScore < 70 ? 'Refresh your resume or portfolio page — recency signals you\'re actively engaged.' : 'Your visibility signal is strong — keep it up to date.',
      },
    ]

    const overall = clamp(subScores.reduce((sum, s) => sum + s.score, 0) / subScores.length)

    return reply.send({ overall, subScores })
  })
}
