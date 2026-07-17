import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireFeature } from '../lib/entitlements'

const gate = [authenticate, requireFeature('career_os')]

// Zuri Career & Growth Engine, Phase 1 (see docs/CAREER_GROWTH_ENGINE_PLAN.md
// §3) — the single professional-identity source every generated artifact
// (resume, cover letter, opportunity match score) reads from, the same
// "one profile, many generated documents" principle business_profiles
// already established for the Brand Kit. One row per user.

const REMOTE_PREFERENCES = ['onsite', 'hybrid', 'remote', 'no_preference'] as const
const RELOCATION_PREFERENCES = ['open', 'not_open', 'depends'] as const

const skillSchema = z.object({
  name: z.string().min(1).max(100),
  level: z.string().max(50).optional(),
  yearsExperience: z.number().min(0).max(60).optional(),
})
const certificationSchema = z.object({
  name: z.string().min(1).max(255),
  issuer: z.string().max(255).optional(),
  year: z.number().optional(),
})
const educationSchema = z.object({
  institution: z.string().min(1).max(255),
  degree: z.string().max(255).optional(),
  field: z.string().max(255).optional(),
  year: z.number().optional(),
})
const languageSchema = z.object({
  name: z.string().min(1).max(100),
  proficiency: z.string().max(50).optional(),
})

const patchProfileBody = z.object({
  headline: z.string().max(255).nullable().optional(),
  summary: z.string().nullable().optional(),
  skills: z.array(skillSchema).optional(),
  certifications: z.array(certificationSchema).optional(),
  education: z.array(educationSchema).optional(),
  languages: z.array(languageSchema).optional(),
  careerGoalsText: z.string().nullable().optional(),
  targetRoles: z.array(z.string().max(100)).optional(),
  targetIndustries: z.array(z.string().max(100)).optional(),
  salaryExpectationCents: z.number().int().nonnegative().nullable().optional(),
  salaryCurrency: z.string().length(3).optional(),
  remotePreference: z.enum(REMOTE_PREFERENCES).nullable().optional(),
  relocationPreference: z.enum(RELOCATION_PREFERENCES).nullable().optional(),
  workAuthorization: z.string().max(2000).nullable().optional(),
  githubUrl: z.string().url().nullable().optional(),
  linkedinUrl: z.string().url().nullable().optional(),
  portfolioUrl: z.string().url().nullable().optional(),
  country: z.string().max(50).nullable().optional(),
  // CV Studio Phase 1 (docs/CV_STUDIO_PLAN.md §3, §18) — Step 1/Step 14
  // wizard fields. Willing-to-relocate/expected-salary reuse the existing
  // relocationPreference/salaryExpectationCents fields above rather than
  // duplicating them.
  phone: z.string().max(30).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  websiteUrl: z.string().url().nullable().optional(),
  drivingLicence: z.string().max(100).nullable().optional(),
  nationality: z.string().max(100).nullable().optional(),
  passportOrNrc: z.string().max(100).nullable().optional(),
  availability: z.string().max(100).nullable().optional(),
  noticePeriod: z.string().max(100).nullable().optional(),
  interests: z.array(z.string().max(100)).optional(),
  referencesMode: z.enum(['available_on_request', 'listed']).optional(),
  defaultPageSize: z.enum(['A4', 'Letter']).optional(),
  useCvTerminology: z.boolean().optional(),
})

const DEFAULT_PROFILE = {
  headline: null, summary: null, skills: [], certifications: [], education: [], languages: [],
  careerGoalsText: null, targetRoles: [], targetIndustries: [], salaryExpectationCents: null,
  salaryCurrency: 'ZMW', remotePreference: null, relocationPreference: null, workAuthorization: null,
  githubUrl: null, linkedinUrl: null, portfolioUrl: null, country: null,
  phone: null, location: null, websiteUrl: null, drivingLicence: null, nationality: null,
  passportOrNrc: null, availability: null, noticePeriod: null, interests: [],
  referencesMode: 'available_on_request', defaultPageSize: 'A4', useCvTerminology: true,
}

function profileApiShape(r: any) {
  return {
    headline: r.headline,
    summary: r.summary,
    skills: r.skills ?? [],
    certifications: r.certifications ?? [],
    education: r.education ?? [],
    languages: r.languages ?? [],
    careerGoalsText: r.career_goals_text,
    targetRoles: r.target_roles ?? [],
    targetIndustries: r.target_industries ?? [],
    salaryExpectationCents: r.salary_expectation_cents != null ? Number(r.salary_expectation_cents) : null,
    salaryCurrency: r.salary_currency,
    remotePreference: r.remote_preference,
    relocationPreference: r.relocation_preference,
    workAuthorization: r.work_authorization,
    githubUrl: r.github_url,
    linkedinUrl: r.linkedin_url,
    portfolioUrl: r.portfolio_url,
    country: r.country,
    phone: r.phone,
    location: r.location,
    websiteUrl: r.website_url,
    drivingLicence: r.driving_licence,
    nationality: r.nationality,
    passportOrNrc: r.passport_or_nrc,
    availability: r.availability,
    noticePeriod: r.notice_period,
    interests: r.interests ?? [],
    referencesMode: r.references_mode,
    defaultPageSize: r.default_page_size,
    useCvTerminology: r.use_cv_terminology,
    updatedAt: r.updated_at,
  }
}

const JSONB_COLUMNS: Record<string, keyof z.infer<typeof patchProfileBody>> = {
  skills: 'skills', certifications: 'certifications', education: 'education', languages: 'languages',
}
const ARRAY_COLUMNS: Record<string, keyof z.infer<typeof patchProfileBody>> = {
  target_roles: 'targetRoles', target_industries: 'targetIndustries', interests: 'interests',
}
const SCALAR_COLUMNS: Record<string, keyof z.infer<typeof patchProfileBody>> = {
  headline: 'headline', summary: 'summary', career_goals_text: 'careerGoalsText',
  salary_expectation_cents: 'salaryExpectationCents', salary_currency: 'salaryCurrency',
  remote_preference: 'remotePreference', relocation_preference: 'relocationPreference',
  work_authorization: 'workAuthorization', github_url: 'githubUrl', linkedin_url: 'linkedinUrl',
  portfolio_url: 'portfolioUrl', country: 'country',
  phone: 'phone', location: 'location', website_url: 'websiteUrl',
  driving_licence: 'drivingLicence', nationality: 'nationality', passport_or_nrc: 'passportOrNrc',
  availability: 'availability', notice_period: 'noticePeriod', references_mode: 'referencesMode',
  default_page_size: 'defaultPageSize', use_cv_terminology: 'useCvTerminology',
}

export async function careerProfileRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/career/profile', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { rows: [profile] } = await db.query(
      'SELECT * FROM career_profiles WHERE user_id = $1', [userId],
    )
    return reply.send({ profile: profile ? profileApiShape(profile) : DEFAULT_PROFILE })
  })

  fastify.patch('/api/career/profile', { preHandler: gate }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const body = patchProfileBody.parse(request.body)

    const sets: string[] = ['updated_at = NOW()']
    const values: unknown[] = [userId]
    let idx = 2

    for (const [col, key] of Object.entries(JSONB_COLUMNS)) {
      const value = body[key]
      if (value === undefined) continue
      sets.push(`${col} = $${idx++}::jsonb`)
      values.push(JSON.stringify(value))
    }
    for (const [col, key] of Object.entries(ARRAY_COLUMNS)) {
      const value = body[key]
      if (value === undefined) continue
      sets.push(`${col} = $${idx++}`)
      values.push(value)
    }
    for (const [col, key] of Object.entries(SCALAR_COLUMNS)) {
      const value = body[key]
      if (value === undefined) continue
      sets.push(`${col} = $${idx++}`)
      values.push(value)
    }

    await db.query(
      `INSERT INTO career_profiles (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET ${sets.join(', ')}`,
      values,
    )

    return reply.send({ ok: true })
  })
}
