import type { CvRenderData } from './pdf/cv-context';

// CV Studio Phase 6 — CV Health (docs/CV_STUDIO_PLAN.md §7, §18 Phase 6).
// Deterministic, non-AI checks layered on top of ATS Analysis (which
// reuses score_resume_text()'s existing SCORE_RESUME prompt verbatim —
// see career-cv-health.ts) — the same "exact thresholds beat narrative"
// discipline Studio's Zuri Insights already established. Every check here
// is a plain comparison against already-known data, no LLM call.

export interface CvHealthIssue {
  key: string;
  description: string;
  fixAction: string;
  points: number;
}

export interface CvHealthResult {
  score: number;
  issues: CvHealthIssue[];
}

const WEAK_VERBS = ['responsible for', 'worked on', 'helped with', 'duties included', 'in charge of'];
const QUANTIFIED_PATTERN = /\d|%|\$|£|k\b|zmw|kwacha/i;
const MIN_SUMMARY_WORDS = 20;
const MAX_SUMMARY_WORDS = 120;
const EMPLOYMENT_GAP_DAYS = 90;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeCvHealth(data: CvRenderData): CvHealthResult {
  const issues: CvHealthIssue[] = [];

  if (!data.contactLine.includes('@')) {
    issues.push({
      key: 'missing_email', description: 'No email address on your profile.',
      fixAction: 'Add your email in Personal Details.', points: 10,
    });
  }

  if (!data.contactLine.toLowerCase().includes('linkedin') && !data.contactLine.includes('linkedin.com')) {
    issues.push({
      key: 'missing_linkedin', description: 'No LinkedIn URL on your profile.',
      fixAction: 'Add your LinkedIn URL in Personal Details.', points: 8,
    });
  }

  const allAchievementText = data.experience.flatMap(e => e.bullets ?? []).join(' ');
  if (data.experience.length > 0 && !QUANTIFIED_PATTERN.test(allAchievementText)) {
    issues.push({
      key: 'no_quantified_achievements', description: 'No measurable numbers found in your achievements/responsibilities.',
      fixAction: 'Use "Add Metrics" on an employment entry to strengthen a bullet with a real number.', points: 15,
    });
  }

  if (data.summary) {
    const words = wordCount(data.summary);
    if (words < MIN_SUMMARY_WORDS) {
      issues.push({
        key: 'summary_too_short', description: `Summary is only ${words} words — too generic.`,
        fixAction: 'Expand your Professional Summary with more specifics.', points: 10,
      });
    } else if (words > MAX_SUMMARY_WORDS) {
      issues.push({
        key: 'summary_too_long', description: `Summary is ${words} words — likely too long.`,
        fixAction: 'Use "Shorten" on your Professional Summary.', points: 8,
      });
    }
  } else {
    issues.push({
      key: 'missing_summary', description: 'No Professional Summary yet.',
      fixAction: 'Write a Professional Summary.', points: 12,
    });
  }

  const sortedByStart = [...data.experience]
    .map(e => ({ ...e, startParsed: parseDate(e.startDate), endParsed: e.current ? null : parseDate(e.endDate) }))
    .filter(e => e.startParsed)
    .sort((a, b) => (a.startParsed as Date).getTime() - (b.startParsed as Date).getTime());
  for (let i = 1; i < sortedByStart.length; i++) {
    const prevEnd = sortedByStart[i - 1].endParsed;
    const curStart = sortedByStart[i].startParsed;
    if (prevEnd && curStart) {
      const gapDays = (curStart.getTime() - prevEnd.getTime()) / 86400000;
      if (gapDays > EMPLOYMENT_GAP_DAYS) {
        issues.push({
          key: `employment_gap_${i}`,
          description: `An unexplained gap of ~${Math.round(gapDays / 30)} month(s) between employment entries.`,
          fixAction: 'Review your Employment History for gaps — add context if needed.', points: 8,
        });
        break; // one gap flagged is enough signal, no need to enumerate every gap
      }
    }
  }

  const estimatedLines = data.experience.reduce((sum, e) => sum + 1 + (e.bullets?.length ?? 1), 0)
    + data.education.length + data.certifications.length + data.awards.length
    + data.volunteer.length + data.memberships.length + data.publications.length;
  if (estimatedLines > 45) {
    issues.push({
      key: 'too_long', description: 'Your CV content looks likely to run over 2 pages.',
      fixAction: 'Trim older/less relevant entries, or use "Shorten" on verbose bullets.', points: 6,
    });
  }

  if (data.certifications.length === 0) {
    issues.push({
      key: 'no_certifications', description: 'No certifications listed.',
      fixAction: 'Add any relevant certifications, if you have them.', points: 5,
    });
  }

  const weakVerbHit = data.experience.some(e =>
    (e.bullets ?? []).some(b => WEAK_VERBS.some(v => b.toLowerCase().includes(v))),
  );
  if (weakVerbHit) {
    issues.push({
      key: 'weak_verbs', description: 'Weak phrasing found (e.g. "responsible for", "worked on").',
      fixAction: 'Use "Convert to achievements" on the affected employment entry.', points: 10,
    });
  }

  const score = Math.max(0, 100 - issues.reduce((sum, i) => sum + i.points, 0));
  return { score, issues };
}

export function buildCvPlainText(data: CvRenderData): string {
  const parts: string[] = [data.fullName];
  if (data.headline) parts.push(data.headline);
  if (data.summary) parts.push(data.summary);
  for (const e of data.experience) {
    parts.push(`${e.title} at ${e.company}`);
    parts.push(...(e.bullets ?? []));
  }
  for (const ed of data.education) {
    parts.push([ed.degree, ed.field, ed.institution].filter(Boolean).join(' '));
  }
  if (data.skills.length > 0) parts.push(`Skills: ${data.skills.join(', ')}`);
  for (const c of data.certifications) parts.push([c.name, c.issuer].filter(Boolean).join(' — '));
  return parts.filter(Boolean).join('\n');
}
