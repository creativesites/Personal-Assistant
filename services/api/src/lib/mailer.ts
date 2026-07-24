import { config } from '../config';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<boolean> {
  if (config.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: config.RESEND_FROM_EMAIL,
          to,
          subject,
          html,
          text: text || html.replace(/<[^>]+>/g, ''),
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[mailer] Resend API error (${res.status}): ${errorText}`);
        return false;
      }

      console.log(`[mailer] Sent email to ${to} via Resend: "${subject}"`);
      return true;
    } catch (err: any) {
      console.error(`[mailer] Failed to send email via Resend to ${to}:`, err.message);
      return false;
    }
  }

  // Development / fallback logger
  console.log(`[mailer:simulated] To: ${to} | Subject: "${subject}"`);
  console.log(`[mailer:simulated] Body:\n${text || html.replace(/<[^>]+>/g, '')}`);
  return true;
}
