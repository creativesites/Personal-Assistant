// @ts-nocheck — see Minimal.tsx's note on @react-pdf/renderer's JSX typings.
import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { CvTemplateProps } from './CvModern';

// CV Studio Phase 5 (docs/CV_STUDIO_PLAN.md §5) — "Creative": a visual
// two-column layout, colored sidebar for contact/skills. For design/media/
// photography/UI/fashion/architecture roles where ATS-parsing matters less
// than visual impression (the plan's own explicit tradeoff for this
// template only — the other three stay single-column/ATS-safe).

const ACCENT = '#7c3aed';

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#1f2937', flexDirection: 'row' },
  sidebar: { width: '32%', backgroundColor: ACCENT, padding: 24, color: '#ffffff' },
  main: { width: '68%', padding: 28 },
  name: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  headline: { fontSize: 10, color: '#ede9fe', marginTop: 3 },
  sidebarSection: { marginTop: 20 },
  sidebarLabel: { fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 1.2, color: '#ddd6fe', fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  sidebarText: { fontSize: 8.5, color: '#f5f3ff', lineHeight: 1.5, marginBottom: 3 },
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
});

function dateRange(startDate?: string, endDate?: string | null, current?: boolean): string {
  const end = current ? 'Present' : (endDate || '');
  return [startDate, end].filter(Boolean).join(' – ');
}

export default function CvCreative({
  fullName, headline, summary, contactLine, pageSize = 'A4',
  experience = [], education = [], skillGroups = [], certifications = [], projects = [],
  awards = [], volunteer = [], memberships = [], publications = [], referencesMode, references = [],
}: CvTemplateProps) {
  const contactLines = (contactLine || '').split(' · ').filter(Boolean);

  return (
    <Document>
      <Page size={pageSize === 'Letter' ? 'LETTER' : 'A4'} style={styles.page}>
        <View style={styles.sidebar}>
          <Text style={styles.name}>{fullName}</Text>
          {headline ? <Text style={styles.headline}>{headline}</Text> : null}

          {contactLines.length > 0 ? (
            <View style={styles.sidebarSection}>
              <Text style={styles.sidebarLabel}>Contact</Text>
              {contactLines.map((c, i) => <Text key={i} style={styles.sidebarText}>{c}</Text>)}
            </View>
          ) : null}

          {skillGroups.length > 0 ? (
            <View style={styles.sidebarSection}>
              <Text style={styles.sidebarLabel}>Skills</Text>
              {skillGroups.map((g, i) => (
                <View key={i} style={{ marginBottom: 6 }}>
                  <Text style={[styles.sidebarText, { fontFamily: 'Helvetica-Bold' }]}>{g.groupName}</Text>
                  <Text style={styles.sidebarText}>{g.skills.join(', ')}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {certifications.length > 0 ? (
            <View style={styles.sidebarSection}>
              <Text style={styles.sidebarLabel}>Certifications</Text>
              {certifications.map((c, i) => <Text key={i} style={styles.sidebarText}>{[c.name, c.year].filter(Boolean).join(', ')}</Text>)}
            </View>
          ) : null}

          {memberships.length > 0 ? (
            <View style={styles.sidebarSection}>
              <Text style={styles.sidebarLabel}>Memberships</Text>
              {memberships.map((m, i) => <Text key={i} style={styles.sidebarText}>{m.institution}</Text>)}
            </View>
          ) : null}
        </View>

        <View style={styles.main}>
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
                      <Text style={styles.bulletDot}>◆</Text>
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

          {projects.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Projects</Text>
              {projects.map((p, i) => <Text key={i} style={styles.summaryText}>{p.title}{p.description ? ` — ${p.description}` : ''}</Text>)}
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
        </View>
      </Page>
    </Document>
  );
}
