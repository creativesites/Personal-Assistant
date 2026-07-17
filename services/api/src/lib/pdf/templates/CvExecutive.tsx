// @ts-nocheck — see Minimal.tsx's note on @react-pdf/renderer's JSX typings.
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { CvTemplateProps } from './CvModern';

// CV Studio Phase 5 (docs/CV_STUDIO_PLAN.md §5) — "Executive": leadership-
// forward — a larger summary block, achievements emphasized over task
// lists, dark section bars. For management/senior engineers/directors/
// consultants.

const DARK = '#0f172a';

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#1f2937', padding: 40 },
  name: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: DARK, letterSpacing: 0.5 },
  headline: { fontSize: 12, color: '#475569', marginTop: 3, fontFamily: 'Helvetica-Bold' },
  contactLine: { fontSize: 8.5, color: '#6b7280', marginTop: 6 },
  summaryBox: { backgroundColor: '#f8fafc', borderRadius: 4, padding: 12, marginTop: 14 },
  summaryText: { fontSize: 10, lineHeight: 1.7, color: '#1e293b' },
  section: { marginTop: 16 },
  sectionBar: { backgroundColor: DARK, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 9 },
  sectionLabel: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.4, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  entry: { marginBottom: 12 },
  entryHeaderRow: { flexDirection: 'row', justifyContent: 'space-between' },
  entryTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK },
  entryDates: { fontSize: 8.5, color: '#6b7280' },
  entrySubtitle: { fontSize: 9.5, color: '#334155', marginTop: 1, fontFamily: 'Helvetica-Bold' },
  bullet: { flexDirection: 'row', marginTop: 5, paddingLeft: 4 },
  bulletDot: { fontSize: 10, width: 12, color: DARK },
  bulletText: { fontSize: 9.5, lineHeight: 1.55, color: '#374151', flex: 1 },
  plainText: { fontSize: 9.5, lineHeight: 1.5, color: '#374151', marginBottom: 3 },
  skillGroupLine: { fontSize: 9.5, marginBottom: 3 },
  skillGroupLabel: { fontFamily: 'Helvetica-Bold', color: DARK },
});

function dateRange(startDate?: string, endDate?: string | null, current?: boolean): string {
  const end = current ? 'Present' : (endDate || '');
  return [startDate, end].filter(Boolean).join(' – ');
}

function Section({ label, children }: { label: string; children: any }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionBar}><Text style={styles.sectionLabel}>{label}</Text></View>
      {children}
    </View>
  );
}

export default function CvExecutive({
  fullName, headline, summary, contactLine, pageSize = 'A4',
  experience = [], education = [], skillGroups = [], certifications = [], projects = [],
  awards = [], volunteer = [], memberships = [], publications = [], referencesMode, references = [],
}: CvTemplateProps) {
  return (
    <Document>
      <Page size={pageSize === 'Letter' ? 'LETTER' : 'A4'} style={styles.page}>
        <Text style={styles.name}>{fullName}</Text>
        {headline ? <Text style={styles.headline}>{headline}</Text> : null}
        {contactLine ? <Text style={styles.contactLine}>{contactLine}</Text> : null}

        {summary ? (
          <View style={styles.summaryBox}><Text style={styles.summaryText}>{summary}</Text></View>
        ) : null}

        {experience.length > 0 ? (
          <Section label="Experience">
            {experience.map((exp, i) => (
              <View key={i} style={styles.entry}>
                <View style={styles.entryHeaderRow}>
                  <Text style={styles.entryTitle}>{exp.title}</Text>
                  <Text style={styles.entryDates}>{dateRange(exp.startDate, exp.endDate, exp.current)}</Text>
                </View>
                <Text style={styles.entrySubtitle}>{[exp.company, exp.location].filter(Boolean).join(' · ')}</Text>
                {(exp.bullets || []).map((b, bi) => (
                  <View key={bi} style={styles.bullet}>
                    <Text style={styles.bulletDot}>—</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}
          </Section>
        ) : null}

        {education.length > 0 ? (
          <Section label="Education">
            {education.map((ed, i) => (
              <View key={i} style={styles.entry}>
                <View style={styles.entryHeaderRow}>
                  <Text style={styles.entryTitle}>{[ed.degree, ed.field].filter(Boolean).join(', ') || ed.institution}</Text>
                  <Text style={styles.entryDates}>{ed.year}</Text>
                </View>
                {ed.degree || ed.field ? <Text style={styles.entrySubtitle}>{ed.institution}</Text> : null}
              </View>
            ))}
          </Section>
        ) : null}

        {skillGroups.length > 0 ? (
          <Section label="Skills">
            {skillGroups.map((g, i) => (
              <Text key={i} style={styles.skillGroupLine}>
                <Text style={styles.skillGroupLabel}>{g.groupName}: </Text>{g.skills.join(', ')}
              </Text>
            ))}
          </Section>
        ) : null}

        {projects.length > 0 ? (
          <Section label="Projects">
            {projects.map((p, i) => <Text key={i} style={styles.plainText}>{p.title}{p.description ? ` — ${p.description}` : ''}</Text>)}
          </Section>
        ) : null}

        {certifications.length > 0 ? (
          <Section label="Certifications">
            {certifications.map((c, i) => <Text key={i} style={styles.plainText}>{[c.name, c.issuer, c.year].filter(Boolean).join(' — ')}</Text>)}
          </Section>
        ) : null}

        {awards.length > 0 ? (
          <Section label="Awards">
            {awards.map((a, i) => <Text key={i} style={styles.plainText}>{[a.title, a.issuer].filter(Boolean).join(' — ')}</Text>)}
          </Section>
        ) : null}

        {volunteer.length > 0 ? (
          <Section label="Volunteer Work">
            {volunteer.map((v, i) => <Text key={i} style={styles.plainText}>{[v.role, v.organisation].filter(Boolean).join(' — ')}</Text>)}
          </Section>
        ) : null}

        {memberships.length > 0 ? (
          <Section label="Professional Memberships">
            {memberships.map((m, i) => <Text key={i} style={styles.plainText}>{m.institution}</Text>)}
          </Section>
        ) : null}

        {publications.length > 0 ? (
          <Section label="Publications">
            {publications.map((p, i) => <Text key={i} style={styles.plainText}>{p.title}</Text>)}
          </Section>
        ) : null}

        <Section label="References">
          {referencesMode === 'listed' && references.length > 0 ? (
            references.map((r, i) => <Text key={i} style={styles.plainText}>{[r.name, r.company].filter(Boolean).join(', ')}</Text>)
          ) : (
            <Text style={styles.plainText}>Available on request</Text>
          )}
        </Section>

        <Text
          style={{ position: 'absolute', bottom: 20, right: 40, fontSize: 8, color: '#9ca3af' }}
          render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} / ${totalPages}` : '')}
        />
      </Page>
    </Document>
  );
}
