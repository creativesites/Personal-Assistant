import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { registerCareerEntryRoutes } from '../lib/career-entry-crud'

// CV Studio Phase 1 (docs/CV_STUDIO_PLAN.md §3, §18) — CRUD for the nine
// Master Career Profile entry tables (migration 0081). Each is a thin
// registerCareerEntryRoutes() call — see career-entry-crud.ts for the
// shared list/create/patch/delete implementation these all share.

const sortOrder = z.number().int().optional()
const dateStr = z.string().max(10).nullable().optional() // 'YYYY-MM-DD'; Postgres validates the actual date

export async function careerProfileEntriesRoutes(fastify: FastifyInstance): Promise<void> {
  registerCareerEntryRoutes(fastify, {
    path: 'employment-history',
    table: 'career_employment_history',
    fields: [
      { column: 'employer', apiKey: 'employer', type: 'plain' },
      { column: 'title', apiKey: 'title', type: 'plain' },
      { column: 'location', apiKey: 'location', type: 'plain' },
      { column: 'employment_type', apiKey: 'employmentType', type: 'plain' },
      { column: 'start_date', apiKey: 'startDate', type: 'plain' },
      { column: 'end_date', apiKey: 'endDate', type: 'plain' },
      { column: 'is_current', apiKey: 'isCurrent', type: 'plain' },
      { column: 'responsibilities', apiKey: 'responsibilities', type: 'plain' },
      { column: 'achievements', apiKey: 'achievements', type: 'array' },
      { column: 'technologies', apiKey: 'technologies', type: 'array' },
      { column: 'manager_name', apiKey: 'managerName', type: 'plain' },
      { column: 'reference_available', apiKey: 'referenceAvailable', type: 'plain' },
      { column: 'reason_for_leaving', apiKey: 'reasonForLeaving', type: 'plain' },
    ],
    createSchema: z.object({
      employer: z.string().min(1).max(255),
      title: z.string().min(1).max(255),
      location: z.string().max(255).optional(),
      employmentType: z.enum(['full_time', 'part_time', 'contract', 'internship', 'freelance', 'volunteer']).optional(),
      startDate: dateStr, endDate: dateStr,
      isCurrent: z.boolean().optional(),
      responsibilities: z.string().optional(),
      achievements: z.array(z.string()).optional(),
      technologies: z.array(z.string()).optional(),
      managerName: z.string().max(255).optional(),
      referenceAvailable: z.boolean().optional(),
      reasonForLeaving: z.string().optional(),
      sortOrder,
    }),
    patchSchema: z.object({
      employer: z.string().min(1).max(255).optional(),
      title: z.string().min(1).max(255).optional(),
      location: z.string().max(255).nullable().optional(),
      employmentType: z.enum(['full_time', 'part_time', 'contract', 'internship', 'freelance', 'volunteer']).nullable().optional(),
      startDate: dateStr, endDate: dateStr,
      isCurrent: z.boolean().optional(),
      responsibilities: z.string().nullable().optional(),
      achievements: z.array(z.string()).optional(),
      technologies: z.array(z.string()).optional(),
      managerName: z.string().max(255).nullable().optional(),
      referenceAvailable: z.boolean().optional(),
      reasonForLeaving: z.string().nullable().optional(),
      sortOrder,
    }),
  })

  registerCareerEntryRoutes(fastify, {
    path: 'education',
    table: 'career_education_entries',
    fields: [
      { column: 'institution', apiKey: 'institution', type: 'plain' },
      { column: 'qualification', apiKey: 'qualification', type: 'plain' },
      { column: 'programme', apiKey: 'programme', type: 'plain' },
      { column: 'start_date', apiKey: 'startDate', type: 'plain' },
      { column: 'end_date', apiKey: 'endDate', type: 'plain' },
      { column: 'grade', apiKey: 'grade', type: 'plain' },
      { column: 'awards', apiKey: 'awards', type: 'plain' },
      { column: 'relevant_modules', apiKey: 'relevantModules', type: 'array' },
    ],
    createSchema: z.object({
      institution: z.string().min(1).max(255),
      qualification: z.string().max(255).optional(),
      programme: z.string().max(255).optional(),
      startDate: dateStr, endDate: dateStr,
      grade: z.string().max(100).optional(),
      awards: z.string().optional(),
      relevantModules: z.array(z.string()).optional(),
      sortOrder,
    }),
    patchSchema: z.object({
      institution: z.string().min(1).max(255).optional(),
      qualification: z.string().max(255).nullable().optional(),
      programme: z.string().max(255).nullable().optional(),
      startDate: dateStr, endDate: dateStr,
      grade: z.string().max(100).nullable().optional(),
      awards: z.string().nullable().optional(),
      relevantModules: z.array(z.string()).optional(),
      sortOrder,
    }),
  })

  registerCareerEntryRoutes(fastify, {
    path: 'certifications',
    table: 'career_certifications',
    fields: [
      { column: 'name', apiKey: 'name', type: 'plain' },
      { column: 'issuer', apiKey: 'issuer', type: 'plain' },
      { column: 'issued_date', apiKey: 'issuedDate', type: 'plain' },
      { column: 'expiry_date', apiKey: 'expiryDate', type: 'plain' },
      { column: 'credential_id', apiKey: 'credentialId', type: 'plain' },
      { column: 'url', apiKey: 'url', type: 'plain' },
      { column: 'upload_document_id', apiKey: 'uploadDocumentId', type: 'plain' },
    ],
    createSchema: z.object({
      name: z.string().min(1).max(255),
      issuer: z.string().max(255).optional(),
      issuedDate: dateStr, expiryDate: dateStr,
      credentialId: z.string().max(255).optional(),
      url: z.string().url().optional(),
      uploadDocumentId: z.string().uuid().optional(),
      sortOrder,
    }),
    patchSchema: z.object({
      name: z.string().min(1).max(255).optional(),
      issuer: z.string().max(255).nullable().optional(),
      issuedDate: dateStr, expiryDate: dateStr,
      credentialId: z.string().max(255).nullable().optional(),
      url: z.string().url().nullable().optional(),
      uploadDocumentId: z.string().uuid().nullable().optional(),
      sortOrder,
    }),
  })

  registerCareerEntryRoutes(fastify, {
    path: 'skill-groups',
    table: 'career_skill_groups',
    fields: [
      { column: 'group_name', apiKey: 'groupName', type: 'plain' },
      { column: 'skills', apiKey: 'skills', type: 'array' },
    ],
    createSchema: z.object({
      groupName: z.string().min(1).max(100),
      skills: z.array(z.string().max(100)).optional(),
      sortOrder,
    }),
    patchSchema: z.object({
      groupName: z.string().min(1).max(100).optional(),
      skills: z.array(z.string().max(100)).optional(),
      sortOrder,
    }),
  })

  registerCareerEntryRoutes(fastify, {
    path: 'awards',
    table: 'career_awards',
    fields: [
      { column: 'title', apiKey: 'title', type: 'plain' },
      { column: 'issuer', apiKey: 'issuer', type: 'plain' },
      { column: 'award_date', apiKey: 'awardDate', type: 'plain' },
      { column: 'description', apiKey: 'description', type: 'plain' },
    ],
    createSchema: z.object({
      title: z.string().min(1).max(255),
      issuer: z.string().max(255).optional(),
      awardDate: dateStr,
      description: z.string().optional(),
      sortOrder,
    }),
    patchSchema: z.object({
      title: z.string().min(1).max(255).optional(),
      issuer: z.string().max(255).nullable().optional(),
      awardDate: dateStr,
      description: z.string().nullable().optional(),
      sortOrder,
    }),
  })

  registerCareerEntryRoutes(fastify, {
    path: 'volunteer-work',
    table: 'career_volunteer_work',
    fields: [
      { column: 'organisation', apiKey: 'organisation', type: 'plain' },
      { column: 'role', apiKey: 'role', type: 'plain' },
      { column: 'start_date', apiKey: 'startDate', type: 'plain' },
      { column: 'end_date', apiKey: 'endDate', type: 'plain' },
      { column: 'description', apiKey: 'description', type: 'plain' },
    ],
    createSchema: z.object({
      organisation: z.string().min(1).max(255),
      role: z.string().max(255).optional(),
      startDate: dateStr, endDate: dateStr,
      description: z.string().optional(),
      sortOrder,
    }),
    patchSchema: z.object({
      organisation: z.string().min(1).max(255).optional(),
      role: z.string().max(255).nullable().optional(),
      startDate: dateStr, endDate: dateStr,
      description: z.string().nullable().optional(),
      sortOrder,
    }),
  })

  // Freeform institution field — never a hardcoded dropdown of named
  // professional bodies (docs/CV_STUDIO_PLAN.md §14).
  registerCareerEntryRoutes(fastify, {
    path: 'memberships',
    table: 'career_memberships',
    fields: [
      { column: 'institution', apiKey: 'institution', type: 'plain' },
      { column: 'membership_number', apiKey: 'membershipNumber', type: 'plain' },
      { column: 'since_date', apiKey: 'sinceDate', type: 'plain' },
    ],
    createSchema: z.object({
      institution: z.string().min(1).max(255),
      membershipNumber: z.string().max(100).optional(),
      sinceDate: dateStr,
      sortOrder,
    }),
    patchSchema: z.object({
      institution: z.string().min(1).max(255).optional(),
      membershipNumber: z.string().max(100).nullable().optional(),
      sinceDate: dateStr,
      sortOrder,
    }),
  })

  registerCareerEntryRoutes(fastify, {
    path: 'publications',
    table: 'career_publications',
    fields: [
      { column: 'title', apiKey: 'title', type: 'plain' },
      { column: 'publisher', apiKey: 'publisher', type: 'plain' },
      { column: 'publication_date', apiKey: 'publicationDate', type: 'plain' },
      { column: 'url', apiKey: 'url', type: 'plain' },
      { column: 'co_authors', apiKey: 'coAuthors', type: 'array' },
    ],
    createSchema: z.object({
      title: z.string().min(1).max(255),
      publisher: z.string().max(255).optional(),
      publicationDate: dateStr,
      url: z.string().url().optional(),
      coAuthors: z.array(z.string()).optional(),
      sortOrder,
    }),
    patchSchema: z.object({
      title: z.string().min(1).max(255).optional(),
      publisher: z.string().max(255).nullable().optional(),
      publicationDate: dateStr,
      url: z.string().url().nullable().optional(),
      coAuthors: z.array(z.string()).optional(),
      sortOrder,
    }),
  })

  // career_profiles.references_mode ('available_on_request' | 'listed') is
  // the per-user switch (see career-profile.ts) — this table only holds
  // individually listed references.
  registerCareerEntryRoutes(fastify, {
    path: 'references',
    table: 'career_references',
    fields: [
      { column: 'name', apiKey: 'name', type: 'plain' },
      { column: 'company', apiKey: 'company', type: 'plain' },
      { column: 'phone', apiKey: 'phone', type: 'plain' },
      { column: 'email', apiKey: 'email', type: 'plain' },
      { column: 'relationship', apiKey: 'relationship', type: 'plain' },
    ],
    createSchema: z.object({
      name: z.string().min(1).max(255),
      company: z.string().max(255).optional(),
      phone: z.string().max(30).optional(),
      email: z.string().email().optional(),
      relationship: z.string().max(100).optional(),
      sortOrder,
    }),
    patchSchema: z.object({
      name: z.string().min(1).max(255).optional(),
      company: z.string().max(255).nullable().optional(),
      phone: z.string().max(30).nullable().optional(),
      email: z.string().email().nullable().optional(),
      relationship: z.string().max(100).nullable().optional(),
      sortOrder,
    }),
  })
}
