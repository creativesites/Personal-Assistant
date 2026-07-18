// @ts-nocheck — see Minimal.tsx's note on @react-pdf/renderer's JSX typings.
import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

// CV Studio Phase 5 (docs/CV_STUDIO_PLAN.md §5) — "Modern": cleaner
// typography, a light indigo accent, still ATS-safe single-column. For
// software/marketing/sales/corporate roles. Sibling to Resume.tsx
// ("Professional") — same section set, different visual treatment.

export interface CvTemplateProps {
  fullName: string;
  headline?: string;
  summary?: string;
  contactLine?: string;
  pageSize?: string;
  experience?: { title: string; company: string; location?: string; startDate?: string; endDate?: string | null; current?: boolean; bullets?: string[] }[];
  education?: { institution: string; degree?: string; field?: string; year?: string }[];
  skillGroups?: { groupName: string; skills: string[] }[];
  certifications?: { name: string; issuer?: string; year?: string }[];
  projects?: { title: string; description?: string }[];
  awards?: { title: string; issuer?: string; description?: string }[];
  volunteer?: { role?: string; organisation: string; description?: string }[];
  memberships?: { institution: string }[];
  publications?: { title: string; publisher?: string }[];
  referencesMode?: string;
  references?: { name: string; company?: string }[];
}

const ACCENT = '#4f46e5';

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#1f2937', padding: 40 },
  name: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#111827' },
  headline: { fontSize: 11, color: ACCENT, marginTop: 3, fontFamily: 'Helvetica-Bold' },
  contactLine: { fontSize: 8.5, color: '#6b7280', marginTop: 6 },
  divider: { borderBottomWidth: 2, borderBottomColor: ACCENT, marginTop: 10, marginBottom: 14, width: 40 },
  section: { marginTop: 14 },
  sectionLabel: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.2, color: ACCENT, fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  summaryText: { fontSize: 9.5, lineHeight: 1.6, color: '#374151' },
  entry: { marginBottom: 10 },
  entryHeaderRow: { flexDirection: 'row', justifyContent: 'space-between' },
  entryTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  entryDates: { fontSize: 8.5, color: '#6b7280' },
  entrySubtitle: { fontSize: 9.5, color: '#374151', marginTop: 1 },
  bullet: { flexDirection: 'row', marginTop: 4, paddingLeft: 4 },
  bulletDot: { fontSize: 9, width: 10, color: ACCENT },
  bulletText: { fontSize: 9, lineHeight: 1.5, color: '#374151', flex: 1 },
  skillGroupLine: { fontSize: 9.5, marginBottom: 3 },
  skillGroupLabel: { fontFamily: 'Helvetica-Bold', color: '#111827' },
});

function dateRange(startDate?: string, endDate?: string | null, current?: boolean): string {
  const end = current ? 'Present' : (endDate || '');
  return [startDate, end].filter(Boolean).join(' – ');
}

export default function CvModern({
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
        <View style={styles.divider} />

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
                  <Text style={styles.entryDates}>{dateRange(exp.startDate, exp.endDate, exp.current)}</Text>
                </View>
                <Text style={styles.entrySubtitle}>{[exp.company, exp.location].filter(Boolean).join(' · ')}</Text>
                {(exp.bullets || []).map((b, bi) => (
                  <View key={bi} style={styles.bullet}>
                    <Text style={styles.bulletDot}>▸</Text>
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
        ) : null}

        {projects.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Projects</Text>
            {projects.map((p, i) => <Text key={i} style={styles.summaryText}>{p.title}{p.description ? ` — ${p.description}` : ''}</Text>)}
          </View>
        ) : null}

        {certifications.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Certifications</Text>
            {certifications.map((c, i) => (
              <Text key={i} style={styles.summaryText}>{[c.name, c.issuer, c.year].filter(Boolean).join(' — ')}</Text>
            ))}
          </View>
        ) : null}

        {awards.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Awards</Text>
            {awards.map((a, i) => <Text key={i} style={styles.summaryText}>{[a.title, a.issuer].filter(Boolean).join(' — ')}</Text>)}
          </View>
        ) : null}

        {volunteer.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Volunteer Work</Text>
            {volunteer.map((v, i) => <Text key={i} style={styles.summaryText}>{[v.role, v.organisation].filter(Boolean).join(' — ')}</Text>)}
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

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>References</Text>
          {referencesMode === 'listed' && references.length > 0 ? (
            references.map((r, i) => <Text key={i} style={styles.summaryText}>{[r.name, r.company].filter(Boolean).join(', ')}</Text>)
          ) : (
            <Text style={styles.summaryText}>Available on request</Text>
          )}
        </View>

        <Text
          style={{ position: 'absolute', bottom: 20, right: 40, fontSize: 8, color: '#9ca3af' }}
          render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} / ${totalPages}` : '')}
        />
      </Page>
    </Document>
  );
}
