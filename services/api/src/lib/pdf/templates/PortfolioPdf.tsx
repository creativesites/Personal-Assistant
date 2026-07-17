// @ts-nocheck — see Minimal.tsx's note on @react-pdf/renderer's JSX typings.
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

// CV Studio Phase 9 (docs/CV_STUDIO_PLAN.md §13) — a rendered view of the
// user's portfolio-visible projects (projects.is_portfolio_visible, CV
// Studio Phase 1). Plain title + description per project — the same
// discipline every other CV Studio template follows: never invent content
// beyond what the user already entered on the project itself.
export interface PortfolioProject {
  title: string;
  description?: string | null;
}

export interface PortfolioPdfProps {
  fullName: string;
  contactLine?: string;
  projects: PortfolioProject[];
}

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10.5, color: '#1f2937', padding: 48 },
  senderName: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  contactLine: { fontSize: 8.5, color: '#6b7280', marginTop: 3 },
  title: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 24, marginBottom: 12, color: '#111827' },
  entry: { marginBottom: 14 },
  entryTitle: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: '#111827' },
  entryDescription: { fontSize: 9.5, color: '#374151', marginTop: 3, lineHeight: 1.5 },
});

export default function PortfolioPdf({ fullName, contactLine, projects }: PortfolioPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.senderName}>{fullName}</Text>
        {contactLine ? <Text style={styles.contactLine}>{contactLine}</Text> : null}
        <Text style={styles.title}>Portfolio</Text>
        {projects.map((p, i) => (
          <View key={i} style={styles.entry}>
            <Text style={styles.entryTitle}>{p.title}</Text>
            {p.description ? <Text style={styles.entryDescription}>{p.description}</Text> : null}
          </View>
        ))}
      </Page>
    </Document>
  );
}
