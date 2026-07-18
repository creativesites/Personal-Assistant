import type { FastifyBaseLogger } from 'fastify'
import { db } from '../lib/db'
import { computeTotals, assignDocumentNumber, sendDocumentViaWhatsApp } from '../routes/documents'
import { renderAndSaveDocument } from '../services/document-render'

const POLL_INTERVAL_MS = 60_000

type DueRule = {
  id: string
  user_id: string
  contact_id: string
  document_type: string
  template_data: { items?: unknown[]; notes?: string; terms?: string }
  recurrence: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  day_of_period: number
  auto_send: boolean
  next_run_at: string
}

// Plain poll-every-minute loop, matching social-publish-worker.ts's house
// style rather than a BullMQ repeatable job. See
// docs/BUSINESS_WORKSPACE_PLAN.md §15 Phase 3.
export function startRecurringDocumentsWorker(log: FastifyBaseLogger): { stop: () => void } {
  let stopped = false
  let running = false

  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      await processDueRules(log)
    } catch (err) {
      log.error({ err }, 'recurring_documents_worker_tick_failed')
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

function computeNextRun(recurrence: DueRule['recurrence'], from: Date): Date {
  const next = new Date(from)
  if (recurrence === 'weekly') next.setDate(next.getDate() + 7)
  else if (recurrence === 'monthly') next.setMonth(next.getMonth() + 1)
  else if (recurrence === 'quarterly') next.setMonth(next.getMonth() + 3)
  else next.setFullYear(next.getFullYear() + 1)
  return next
}

async function processDueRules(log: FastifyBaseLogger): Promise<void> {
  const { rows: due } = await db.query<{ id: string }>(
    `SELECT id FROM recurring_documents WHERE is_active = TRUE AND next_run_at <= NOW()`,
  )
  if (due.length === 0) return

  for (const { id } of due) {
    await runOne(id, log)
  }
}

async function runOne(id: string, log: FastifyBaseLogger): Promise<void> {
  // Claim by advancing next_run_at first — a slow render/send call can't
  // cause the next tick to double-process this rule (same principle as
  // social-publish-worker.ts's status-flip claim, adapted for a recurring
  // rule that has no terminal "sending" state of its own).
  const { rows: [rule] } = await db.query<DueRule>(
    `SELECT * FROM recurring_documents WHERE id = $1 AND next_run_at <= NOW()`,
    [id],
  )
  if (!rule) return

  const nextRunAt = computeNextRun(rule.recurrence, new Date(rule.next_run_at))
  const { rowCount } = await db.query(
    `UPDATE recurring_documents SET next_run_at = $1, updated_at = NOW() WHERE id = $2 AND next_run_at <= NOW()`,
    [nextRunAt, id],
  )
  if (!rowCount) return

  try {
    const items = (rule.template_data.items ?? []) as Parameters<typeof computeTotals>[0]
    const { computedItems, subtotalCents, discountCents, taxCents, totalCents } = computeTotals(items)
    const documentNumber = await assignDocumentNumber(rule.user_id, rule.document_type)
    const title = `${rule.document_type[0].toUpperCase()}${rule.document_type.slice(1)} ${documentNumber}`

    const structuredData = {
      items: computedItems,
      notes: rule.template_data.notes ?? null,
      terms: rule.template_data.terms ?? null,
      validUntil: null,
      dueDate: null,
    }

    const { rows: [doc] } = await db.query(
      `INSERT INTO documents
         (user_id, contact_id, document_type, document_category, document_number, title, status,
          structured_data, subtotal_cents, discount_cents, tax_cents, total_cents, requested_by, ai_generated)
       VALUES ($1,$2,$3,'sales',$4,$5,'draft',$6,$7,$8,$9,$10,'schedule',false)
       RETURNING id`,
      [rule.user_id, rule.contact_id, rule.document_type, documentNumber, title,
        JSON.stringify(structuredData), subtotalCents, discountCents, taxCents, totalCents],
    )
    await db.query(
      `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'created', $2)`,
      [doc.id, JSON.stringify({ recurringDocumentId: rule.id })],
    )

    // This is a genuinely headless trigger — no browser is open to render
    // client-side (see CLAUDE.md's "PDF Rendering Architecture"), so it
    // stays on the server-render pipeline. Previously this fetched
    // `${intelligenceUrl}/internal/documents/:id/render`, a route that has
    // never existed on the Python service (the real render endpoint has
    // always lived in services/api) — so scheduled documents silently never
    // got a PDF. Fixed by calling the renderer directly in-process, since
    // this worker already runs inside services/api itself.
    await renderAndSaveDocument(doc.id, rule.user_id)

    if (rule.auto_send) {
      await sendDocumentViaWhatsApp(rule.user_id, doc.id)
    }

    await db.query(
      `UPDATE recurring_documents SET last_run_at = NOW(), last_document_id = $1 WHERE id = $2`,
      [doc.id, rule.id],
    )
    log.info({ ruleId: rule.id, documentId: doc.id }, 'recurring_document_generated')
  } catch (err) {
    log.error({ err, ruleId: rule.id }, 'recurring_document_generate_failed')
  }
}
