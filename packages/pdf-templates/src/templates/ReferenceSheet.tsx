// @ts-nocheck — see Minimal.tsx's note on @react-pdf/renderer's JSX typings.
import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

// CV Studio Phase 9 (docs/CV_STUDIO_PLAN.md §13) — a rendered view of
// career_references, for the "listed" references_mode (§14). Deliberately
// plain: this document's value is the contact information, not the layout.
export interface ReferenceSheetReference {
  name: string;
  company?: string | null;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface ReferenceSheetProps {
  fullName: string;
  contactLine?: string;
  references: ReferenceSheetReference[];
}

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10.5, color: '#1f2937', padding: 48 },
  senderName: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  contactLine: { fontSize: 8.5, color: '#6b7280', marginTop: 3 },
  title: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 24, marginBottom: 12, color: '#111827' },
  entry: { marginBottom: 14 },
  entryName: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: '#111827' },
  entryLine: { fontSize: 9.5, color: '#374151', marginTop: 2 },
});

export default function ReferenceSheet({ fullName, contactLine, references }: ReferenceSheetProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.senderName}>{fullName}</Text>
        {contactLine ? <Text style={styles.contactLine}>{contactLine}</Text> : null}
        <Text style={styles.title}>Professional References</Text>
        {references.map((r, i) => (
          <View key={i} style={styles.entry}>
            <Text style={styles.entryName}>{r.name}</Text>
            {(r.relationship || r.company) && (
              <Text style={styles.entryLine}>{[r.relationship, r.company].filter(Boolean).join(', ')}</Text>
            )}
            {(r.phone || r.email) && (
              <Text style={styles.entryLine}>{[r.phone, r.email].filter(Boolean).join(' · ')}</Text>
            )}
          </View>
        ))}
      </Page>
    </Document>
  );
}
