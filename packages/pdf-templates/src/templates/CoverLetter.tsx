// @ts-nocheck — see Minimal.tsx's note on @react-pdf/renderer's JSX typings.
import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

// Career & Growth Engine Phase 3 (docs/CAREER_GROWTH_ENGINE_PLAN.md §8) — a
// plain business-letter layout. Kept deliberately simple: a cover letter's
// value is the writing, not the layout.
export interface CoverLetterProps {
  fullName: string;
  contactLine?: string;
  date: string;
  recipientName?: string | null;
  companyName?: string | null;
  body: string;
  signOff: string;
}

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10.5, color: '#1f2937', padding: 48 },
  senderName: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  contactLine: { fontSize: 8.5, color: '#6b7280', marginTop: 3 },
  date: { fontSize: 9.5, color: '#374151', marginTop: 20 },
  recipientBlock: { marginTop: 16 },
  recipientText: { fontSize: 9.5, color: '#374151' },
  body: { marginTop: 20, fontSize: 10, lineHeight: 1.7, color: '#1f2937' },
  paragraph: { marginBottom: 12 },
  signOff: { marginTop: 20, fontSize: 10, lineHeight: 1.6 },
});

export default function CoverLetter({
  fullName, contactLine, date, recipientName, companyName, body, signOff,
}: CoverLetterProps) {
  const paragraphs = body.split('\n\n').filter(Boolean);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.senderName}>{fullName}</Text>
        {contactLine ? <Text style={styles.contactLine}>{contactLine}</Text> : null}

        <Text style={styles.date}>{date}</Text>

        {(recipientName || companyName) ? (
          <View style={styles.recipientBlock}>
            {recipientName ? <Text style={styles.recipientText}>{recipientName}</Text> : null}
            {companyName ? <Text style={styles.recipientText}>{companyName}</Text> : null}
          </View>
        ) : null}

        <View style={styles.body}>
          {paragraphs.map((p, i) => <Text key={i} style={styles.paragraph}>{p}</Text>)}
        </View>

        <Text style={styles.signOff}>{signOff}</Text>
      </Page>
    </Document>
  );
}
