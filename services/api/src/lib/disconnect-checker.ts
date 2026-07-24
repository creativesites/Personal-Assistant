import { db } from './db';
import { sendEmail } from './mailer';

let checkInterval: NodeJS.Timeout | null = null;

export async function checkDisconnectedSessions(): Promise<void> {
  try {
    // Find all sessions disconnected for > 10 minutes that haven't sent an alert yet
    const { rows } = await db.query<{
      instance_id: string;
      user_id: string;
      user_email: string;
      user_name: string | null;
      phone_number: string | null;
      disconnected_at: string;
    }>(
      `SELECT wi.id AS instance_id, wi.user_id, u.email AS user_email, u.full_name AS user_name,
              wi.phone_number, wi.disconnected_at
       FROM whatsapp_instances wi
       JOIN users u ON u.id = wi.user_id
       WHERE wi.status IN ('disconnected', 'error', 'logged_out')
         AND wi.disconnected_at IS NOT NULL
         AND wi.disconnected_at <= NOW() - INTERVAL '10 minutes'
         AND wi.disconnect_alert_sent_at IS NULL`
    );

    if (rows.length === 0) return;

    console.log(`[disconnect-checker] Found ${rows.length} session(s) disconnected > 10 minutes without alert`);

    for (const row of rows) {
      const name = row.user_name || 'Zuri User';
      const phone = row.phone_number ? `+${row.phone_number}` : 'your WhatsApp number';
      const disconnectedTime = new Date(row.disconnected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; rounded: 12px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #4f46e5; margin: 0; font-size: 24px;">Zuri Relationship OS</h1>
          </div>
          <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
            <h2 style="color: #991b1b; margin: 0 0 8px 0; font-size: 16px; display: flex; align-items: center;">
              ⚠️ Action Required: WhatsApp Connection Offline
            </h2>
            <p style="color: #7f1d1d; margin: 0; font-size: 14px; line-height: 1.5;">
              Hi ${name}, your WhatsApp connection (${phone}) disconnected at <strong>${disconnectedTime}</strong> and has been offline for over 10 minutes.
            </p>
          </div>
          <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            While disconnected, automated customer message ingestion, contact profiling, and AI reply drafts are currently paused.
          </p>
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <p style="color: #475569; font-size: 13px; margin: 0 0 8px 0; font-weight: 600;">How to fix this quickly:</p>
            <ol style="color: #475569; font-size: 13px; margin: 0; padding-left: 20px; line-height: 1.6;">
              <li>Ensure your phone is powered on and connected to Wi-Fi / cellular data.</li>
              <li>Open Zuri dashboard and click <strong>"⚡ Reconnect WhatsApp"</strong> to scan a fresh QR code if needed.</li>
            </ol>
          </div>
          <div style="text-align: center; margin-top: 28px;">
            <a href="https://zuri-personal-assistant-delta.vercel.app/inbox" 
               style="background-color: #4f46e5; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 24px; border-radius: 8px; display: inline-block; font-size: 14px;">
              Open Zuri Dashboard & Reconnect →
            </a>
          </div>
        </div>
      `;

      const sent = await sendEmail({
        to: row.user_email,
        subject: `⚠️ Alert: Your Zuri WhatsApp Connection is Offline (${phone})`,
        html: emailHtml,
      });

      if (sent) {
        await db.query(
          `UPDATE whatsapp_instances SET disconnect_alert_sent_at = NOW() WHERE id = $1`,
          [row.instance_id]
        );
        console.log(`[disconnect-checker] Disconnect alert email marked as sent for user ${row.user_id}`);
      }
    }
  } catch (err: any) {
    console.error('[disconnect-checker] Error checking disconnected sessions:', err.message);
  }
}

export function startDisconnectChecker(intervalMs = 60_000): void {
  if (checkInterval) return;
  console.log('[disconnect-checker] Starting 10-minute WhatsApp disconnection monitor (interval 60s)');
  checkInterval = setInterval(() => {
    checkDisconnectedSessions().catch(err => console.error('[disconnect-checker] loop error:', err));
  }, intervalMs);
}

export function stopDisconnectChecker(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
