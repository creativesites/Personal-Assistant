// @ts-nocheck — see Minimal.tsx's note on @react-pdf/renderer's JSX typings.
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

// Career & Growth Engine Phase 3 (docs/CAREER_GROWTH_ENGINE_PLAN.md §8) —
// deliberately its own template rather than a fit into Minimal/Modern, which
// assume a business/contact/line-items shape a resume doesn't have. ATS-plain
// by design: single column, no tables/graphics/multi-column layout, standard
// section headings — the layout choice that most affects whether an
// applicant-tracking system can actually parse the content. Modern/Executive
// resume variants are deferred (see CLAUDE.md) until there's a concrete need
// beyond this first, safest default.
export interface ResumeExperience {
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string | null;
  current?: boolean;
  bullets?: string[];
}

export interface ResumeEducation {
  institution: string;
  degree?: string;
  field?: string;
  year?: string;
}

export interface ResumeCertification {
  name: string;
  issuer?: string;
  year?: string;
}

export interface ResumeLanguage {
  name: string;
  proficiency?: string;
}

export interface ResumeProps {
  fullName: string;
  headline?: string;
  summary?: string;
  contactLine?: string;
  pageSize?: string;
  experience?: ResumeExperience[];
  education?: ResumeEducation[];
  skills?: string[];
  certifications?: ResumeCertification[];
  languages?: ResumeLanguage[];
  // CV Studio's CvRenderData shape (services/api/src/lib/pdf/cv-context.ts) —
  // Resume ("professional") is CV Studio's default templateKey, so it must
  // render the same section set CvModern/CvExecutive/CvCreative do, not just
  // the narrower shape the older Resume Studio generate-flow passes. Kept
  // optional/unused-when-absent so renderResumePdf()'s callers (which never
  // pass these) are unaffected.
  skillGroups?: { groupName: string; skills: string[] }[];
  projects?: { title: string; description?: string }[];
  awards?: { title: string; issuer?: string; description?: string }[];
  volunteer?: { role?: string; organisation: string; description?: string }[];
  memberships?: { institution: string }[];
  publications?: { title: string; publisher?: string }[];
  referencesMode?: string;
  references?: { name: string; company?: string }[];
}

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#1f2937', padding: 40 },
  name: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#111827' },
  headline: { fontSize: 11, color: '#4b5563', marginTop: 2 },
  contactLine: { fontSize: 8.5, color: '#6b7280', marginTop: 6 },
  section: { marginTop: 16 },
  sectionLabel: {
    fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#111827',
    fontFamily: 'Helvetica-Bold', borderBottomWidth: 1, borderBottomColor: '#d1d5db',
    paddingBottom: 4, marginBottom: 8,
  },
  summaryText: { fontSize: 9.5, lineHeight: 1.6, color: '#374151' },
  entry: { marginBottom: 10 },
  entryHeaderRow: { flexDirection: 'row', justifyContent: 'space-between' },
  entryTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  entryDates: { fontSize: 8.5, color: '#6b7280' },
  entrySubtitle: { fontSize: 9.5, color: '#374151', marginTop: 1 },
  bullet: { flexDirection: 'row', marginTop: 4, paddingLeft: 4 },
  bulletDot: { fontSize: 9, width: 10 },
  bulletText: { fontSize: 9, lineHeight: 1.5, color: '#374151', flex: 1 },
  skillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillChip: { fontSize: 8.5, color: '#374151', backgroundColor: '#f3f4f6', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 3, marginRight: 4, marginBottom: 4 },
  skillGroupLine: { fontSize: 9.5, marginBottom: 3 },
  skillGroupLabel: { fontFamily: 'Helvetica-Bold', color: '#111827' },
});

function dateRange(exp: ResumeExperience): string {
  const end = exp.current ? 'Present' : (exp.endDate || '');
  return [exp.startDate, end].filter(Boolean).join(' – ');
}

export default function Resume({
  fullName, headline, summary, contactLine, pageSize = 'A4', experience = [], education = [],
  skills = [], certifications = [], languages = [], skillGroups = [], projects = [],
  awards = [], volunteer = [], memberships = [], publications = [], referencesMode, references = [],
}: ResumeProps) {
  return (
    <Document>
      <Page size={pageSize === 'Letter' ? 'LETTER' : 'A4'} style={styles.page}>
        <Text style={styles.name}>{fullName}</Text>
        {headline ? <Text style={styles.headline}>{headline}</Text> : null}
        {contactLine ? <Text style={styles.contactLine}>{contactLine}</Text> : null}

        {summary ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Summary</Text>
            <Text style={styles.summaryText}>{summary}</Text>
          </View>
        ) : null}

        {experience.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Experience</Text>
            {experience.map((exp, i) => (
              <View key={i} style={styles.entry}>
                <View style={styles.entryHeaderRow}>
                  <Text style={styles.entryTitle}>{exp.title}</Text>
                  <Text style={styles.entryDates}>{dateRange(exp)}</Text>
                </View>
                <Text style={styles.entrySubtitle}>
                  {[exp.company, exp.location].filter(Boolean).join(' · ')}
                </Text>
                {(exp.bullets || []).map((b, bi) => (
                  <View key={bi} style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {education.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Education</Text>
            {education.map((ed, i) => (
              <View key={i} style={styles.entry}>
                <View style={styles.entryHeaderRow}>
                  <Text style={styles.entryTitle}>{[ed.degree, ed.field].filter(Boolean).join(', ') || ed.institution}</Text>
                  <Text style={styles.entryDates}>{ed.year}</Text>
                </View>
                {ed.degree || ed.field ? <Text style={styles.entrySubtitle}>{ed.institution}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {skillGroups.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Skills</Text>
            {skillGroups.map((g, i) => (
              <Text key={i} style={styles.skillGroupLine}>
                <Text style={styles.skillGroupLabel}>{g.groupName}: </Text>{g.skills.join(', ')}
              </Text>
            ))}
          </View>
        ) : skills.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Skills</Text>
            <View style={styles.skillsWrap}>
              {skills.map((s, i) => <Text key={i} style={styles.skillChip}>{s}</Text>)}
            </View>
          </View>
        ) : null}

        {projects.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Projects</Text>
            {projects.map((p, i) => (
              <Text key={i} style={styles.summaryText}>{p.title}{p.description ? ` — ${p.description}` : ''}</Text>
            ))}
          </View>
        ) : null}

        {certifications.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Certifications</Text>
            {certifications.map((c, i) => (
              <Text key={i} style={styles.summaryText}>
                {[c.name, c.issuer, c.year].filter(Boolean).join(' — ')}
              </Text>
            ))}
          </View>
        ) : null}

        {awards.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Awards</Text>
            {awards.map((a, i) => (
              <Text key={i} style={styles.summaryText}>{[a.title, a.issuer].filter(Boolean).join(' — ')}</Text>
            ))}
          </View>
        ) : null}

        {volunteer.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Volunteer Work</Text>
            {volunteer.map((v, i) => (
              <Text key={i} style={styles.summaryText}>{[v.role, v.organisation].filter(Boolean).join(' — ')}</Text>
            ))}
          </View>
        ) : null}

        {memberships.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Professional Memberships</Text>
            {memberships.map((m, i) => <Text key={i} style={styles.summaryText}>{m.institution}</Text>)}
          </View>
        ) : null}

        {publications.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Publications</Text>
            {publications.map((p, i) => <Text key={i} style={styles.summaryText}>{p.title}</Text>)}
          </View>
        ) : null}

        {languages.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Languages</Text>
            <Text style={styles.summaryText}>
              {languages.map(l => [l.name, l.proficiency].filter(Boolean).join(' (') + (l.proficiency ? ')' : '')).join(', ')}
            </Text>
          </View>
        ) : null}

        {referencesMode ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>References</Text>
            {referencesMode === 'listed' && references.length > 0 ? (
              references.map((r, i) => (
                <Text key={i} style={styles.summaryText}>{[r.name, r.company].filter(Boolean).join(', ')}</Text>
              ))
            ) : (
              <Text style={styles.summaryText}>Available on request</Text>
            )}
          </View>
        ) : null}

        <Text
          style={{ position: 'absolute', bottom: 20, right: 40, fontSize: 8, color: '#9ca3af' }}
          render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} / ${totalPages}` : '')}
        />
      </Page>
    </Document>
  );
}
