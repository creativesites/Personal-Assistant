import type { FastifyBaseLogger } from 'fastify'
import { db } from '../lib/db'
import { config } from '../config'

const POLL_INTERVAL_MS = 10 * 60_000 // 10 minutes

type UnpaidInvoice = {
  id: string
  user_id: string
  contact_id: string
  document_number: string
  title: string
  total_cents: number
  currency: string
  share_token: string
  expires_at: string | null
  created_at: string
  phone_number: string | null
  whatsapp_jid: string | null
  custom_name: string | null
}

export function startDunningReminderWorker(log: FastifyBaseLogger): { stop: () => void } {
  let stopped = false
  let running = false

  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      await processDunningReminders(log)
    } catch (err) {
      log.error({ err }, 'dunning_reminder_worker_tick_failed')
    } finally {
      running = false
    }
  }

  const interval = setInterval(tick, POLL_INTERVAL_MS)
  return {
    stop: () => {
      stopped = true
      clearInterval(interval)
    },
  }
}

async function processDunningReminders(log: FastifyBaseLogger): Promise<void> {
  // Query unpaid invoices or quotations with a contact
  const { rows: unpaid } = await db.query<UnpaidInvoice>(
    `SELECT d.id, d.user_id, d.contact_id, d.document_number, d.title, d.total_cents, d.currency,
            d.share_token, d.expires_at, d.created_at,
            c.phone_number, c.whatsapp_jid, c.custom_name
     FROM documents d
     JOIN contacts c ON c.id = d.contact_id
     WHERE d.document_type IN ('invoice', 'quotation')
       AND d.status IN ('sent', 'viewed', 'generated')
       AND (c.phone_number IS NOT NULL OR c.whatsapp_jid IS NOT NULL)`
  )

  if (unpaid.length === 0) return

  const now = new Date()

  for (const doc of unpaid) {
    const dueDate = doc.expires_at ? new Date(doc.expires_at) : new Date(new Date(doc.created_at).getTime() + 14 * 86400000)
    const diffDays = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    let stage: 'upcoming_3d' | 'due_today' | 'overdue_7d' | null = null

    if (diffDays === 3 || diffDays === 2) {
      stage = 'upcoming_3d'
    } else if (diffDays === 0) {
      stage = 'due_today'
    } else if (diffDays === -7 || diffDays === -8) {
      stage = 'overdue_7d'
    }

    if (!stage) continue

    // Check if we already logged or sent this reminder stage for this document
    const { rows: [existing] } = await db.query(
      `SELECT id FROM document_dunning_schedules WHERE document_id = $1 AND reminder_stage = $2`,
      [doc.id, stage]
    )
    if (existing) continue

    await sendDunningReminder(doc, stage, log)
  }
}

async function sendDunningReminder(
  doc: UnpaidInvoice,
  stage: 'upcoming_3d' | 'due_today' | 'overdue_7d',
  log: FastifyBaseLogger
): Promise<void> {
  const formattedTotal = (doc.total_cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: doc.currency || 'ZMW',
  })

  const clientName = doc.custom_name ? ` ${doc.custom_name}` : ''
  const publicUrl = `${config.PUBLIC_API_URL || 'http://localhost:3000'}/shared/${doc.share_token}`

  let messageText = ''
  if (stage === 'upcoming_3d') {
    messageText = `Hi${clientName}, friendly reminder that ${doc.document_number} (${formattedTotal}) is due in 3 days. You can view & sign it online here: ${publicUrl}`
  } else if (stage === 'due_today') {
    messageText = `Hi${clientName}, ${doc.document_number} (${formattedTotal}) is due today. Please review & complete payment or e-signature here: ${publicUrl}`
  } else if (stage === 'overdue_7d') {
    messageText = `Hi${clientName}, notice regarding ${doc.document_number} (${formattedTotal}), which is now 7 days overdue. Please click to complete: ${publicUrl}`
  }

  const targetJid = doc.whatsapp_jid || (doc.phone_number ? `${doc.phone_number.replace(/\+/g, '')}@s.whatsapp.net` : null)
  if (!targetJid) return

  try {
    const whatsappUrl = process.env.WHATSAPP_SERVICE_URL ?? config.WHATSAPP_SERVICE_URL ?? 'http://localhost:3001'
    const res = await fetch(`${whatsappUrl}/api/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: doc.user_id,
        to: targetJid,
        text: messageText,
      }),
    })

    const status = res.ok ? 'sent' : 'failed'
    const waData = (res.ok ? await res.json().catch(() => ({})) : {}) as { messageId?: string }

    await db.query(
      `INSERT INTO document_dunning_schedules
         (document_id, user_id, contact_id, reminder_stage, status, scheduled_at, sent_at, wa_message_id)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)`,
      [doc.id, doc.user_id, doc.contact_id, stage, status, waData.messageId || null]
    )

    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'dunning_sent', $2)`,
      [doc.id, JSON.stringify({ stage, status, messageText })]
    )

    log.info({ documentId: doc.id, stage, status }, 'dunning_reminder_sent')
  } catch (err) {
    log.error({ err, documentId: doc.id, stage }, 'dunning_reminder_send_failed')
    await db.query(
      `INSERT INTO document_dunning_schedules
         (document_id, user_id, contact_id, reminder_stage, status, scheduled_at, error)
       VALUES ($1, $2, $3, $4, 'failed', NOW(), $5)`,
      [doc.id, doc.user_id, doc.contact_id, stage, String(err)]
    )
  }
}
