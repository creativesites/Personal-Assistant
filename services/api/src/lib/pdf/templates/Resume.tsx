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
  experience?: ResumeExperience[];
  education?: ResumeEducation[];
  skills?: string[];
  certifications?: ResumeCertification[];
  languages?: ResumeLanguage[];
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
});

function dateRange(exp: ResumeExperience): string {
  const end = exp.current ? 'Present' : (exp.endDate || '');
  return [exp.startDate, end].filter(Boolean).join(' – ');
}

export default function Resume({
  fullName, headline, summary, contactLine, experience = [], education = [],
  skills = [], certifications = [], languages = [],
}: ResumeProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
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

        {skills.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Skills</Text>
            <View style={styles.skillsWrap}>
              {skills.map((s, i) => <Text key={i} style={styles.skillChip}>{s}</Text>)}
            </View>
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

        {languages.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Languages</Text>
            <Text style={styles.summaryText}>
              {languages.map(l => [l.name, l.proficiency].filter(Boolean).join(' (') + (l.proficiency ? ')' : '')).join(', ')}
            </Text>
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
