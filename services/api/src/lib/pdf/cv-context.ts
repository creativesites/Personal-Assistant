import { db } from '../db';

// CV Studio Phase 5 — Templates + Render Pipeline (docs/CV_STUDIO_PLAN.md
// §5, §18 Phase 5). Assembles the live data a career_cvs row's PDF needs
// straight from the Phase 1 relational tables — a pure data read, no AI
// call, matching the "the real React-PDF render happens on-demand" note
// from §9. This is a Node-owned assembly (services/api already owns
// career_cvs/career_profiles/the entry tables directly) rather than a
// round-trip to the intelligence service, since nothing here needs an LLM.

export interface CvExperience {
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string | null;
  current?: boolean;
  bullets?: string[];
}

export interface CvEducation {
  institution: string;
  degree?: string;
  field?: string;
  year?: string;
}

export interface CvCertification {
  name: string;
  issuer?: string;
  year?: string;
}

export interface CvSkillGroup {
  groupName: string;
  skills: string[];
}

export interface CvAward {
  title: string;
  issuer?: string;
  description?: string;
}

export interface CvVolunteer {
  role?: string;
  organisation: string;
  description?: string;
}

export interface CvMembership {
  institution: string;
}

export interface CvPublication {
  title: string;
  publisher?: string;
}

export interface CvReference {
  name: string;
  company?: string;
}

export interface CvProject {
  title: string;
  description?: string;
}

export interface CvRenderData {
  title: string;
  templateKey: string;
  pageSize: string;
  fullName: string;
  headline?: string;
  summary?: string;
  contactLine: string;
  experience: CvExperience[];
  education: CvEducation[];
  skillGroups: CvSkillGroup[];
  skills: string[];
  certifications: CvCertification[];
  projects: CvProject[];
  awards: CvAward[];
  volunteer: CvVolunteer[];
  memberships: CvMembership[];
  publications: CvPublication[];
  referencesMode: 'available_on_request' | 'listed';
  references: CvReference[];
}

export async function buildCvRenderData(cvId: string, userId: string): Promise<CvRenderData | null> {
  const { rows: [cv] } = await db.query(
    'SELECT id, title, template_key, page_size FROM career_cvs WHERE id = $1 AND user_id = $2', [cvId, userId],
  );
  if (!cv) return null;

  const [
    profileResult, employmentResult, educationResult, certificationsResult, skillGroupsResult,
    awardsResult, volunteerResult, membershipsResult, publicationsResult, referencesResult, projectLinksResult,
  ] = await Promise.all([
    db.query(
      `SELECT headline, summary, phone, location, github_url, linkedin_url, portfolio_url, website_url, references_mode
       FROM career_profiles WHERE user_id = $1`, [userId],
    ),
    db.query(
      `SELECT title, employer, location, start_date, end_date, is_current, responsibilities, achievements
       FROM career_employment_history WHERE user_id = $1 ORDER BY sort_order ASC, start_date DESC NULLS LAST`, [userId],
    ),
    db.query(
      `SELECT institution, qualification, programme, end_date
       FROM career_education_entries WHERE user_id = $1 ORDER BY sort_order ASC, end_date DESC NULLS LAST`, [userId],
    ),
    db.query(
      `SELECT name, issuer, issued_date FROM career_certifications WHERE user_id = $1 ORDER BY sort_order ASC`, [userId],
    ),
    db.query(
      `SELECT group_name, skills FROM career_skill_groups WHERE user_id = $1 ORDER BY sort_order ASC`, [userId],
    ),
    db.query(
      `SELECT title, issuer, description FROM career_awards WHERE user_id = $1 ORDER BY sort_order ASC`, [userId],
    ),
    db.query(
      `SELECT role, organisation, description FROM career_volunteer_work WHERE user_id = $1 ORDER BY sort_order ASC`, [userId],
    ),
    db.query(
      `SELECT institution FROM career_memberships WHERE user_id = $1 ORDER BY sort_order ASC`, [userId],
    ),
    db.query(
      `SELECT title, publisher FROM career_publications WHERE user_id = $1 ORDER BY sort_order ASC`, [userId],
    ),
    db.query(
      `SELECT name, company FROM career_references WHERE user_id = $1 ORDER BY sort_order ASC`, [userId],
    ),
    db.query(
      `SELECT l.custom_description_override, p.title, p.description FROM career_cv_project_links l
       JOIN projects p ON p.id = l.project_id WHERE l.cv_id = $1 ORDER BY l.sort_order ASC`, [cvId],
    ),
  ]);

  const profile = profileResult.rows[0] ?? {};
  const contactLine = [profile.location, profile.phone, profile.github_url, profile.linkedin_url, profile.portfolio_url, profile.website_url]
    .filter(Boolean).join(' · ');

  return {
    title: cv.title,
    templateKey: cv.template_key,
    pageSize: cv.page_size,
    fullName: profile.headline || cv.title,
    headline: profile.headline,
    summary: profile.summary,
    contactLine,
    experience: employmentResult.rows.map(e => ({
      title: e.title, company: e.employer, location: e.location,
      startDate: e.start_date, endDate: e.end_date, current: e.is_current,
      bullets: Array.isArray(e.achievements) && e.achievements.length > 0
        ? e.achievements
        : (e.responsibilities ? [e.responsibilities] : []),
    })),
    education: educationResult.rows.map(e => ({
      institution: e.institution, degree: e.qualification, field: e.programme,
      year: e.end_date ? String(e.end_date).slice(0, 4) : undefined,
    })),
    skillGroups: skillGroupsResult.rows.map(g => ({ groupName: g.group_name, skills: g.skills ?? [] })),
    skills: skillGroupsResult.rows.flatMap(g => g.skills ?? []),
    certifications: certificationsResult.rows.map(c => ({
      name: c.name, issuer: c.issuer, year: c.issued_date ? String(c.issued_date).slice(0, 4) : undefined,
    })),
    projects: projectLinksResult.rows.map(p => ({ title: p.title, description: p.custom_description_override || p.description })),
    awards: awardsResult.rows.map(a => ({ title: a.title, issuer: a.issuer, description: a.description })),
    volunteer: volunteerResult.rows.map(v => ({ role: v.role, organisation: v.organisation, description: v.description })),
    memberships: membershipsResult.rows.map(m => ({ institution: m.institution })),
    publications: publicationsResult.rows.map(p => ({ title: p.title, publisher: p.publisher })),
    referencesMode: profile.references_mode ?? 'available_on_request',
    references: referencesResult.rows.map(r => ({ name: r.name, company: r.company })),
  };
}
