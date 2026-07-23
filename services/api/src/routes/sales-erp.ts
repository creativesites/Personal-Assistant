import type { FastifyInstance } from 'fastify'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'

interface OrderRow {
  id: string
  order_number: string
  contact_id: string | null
  status: string
  fulfillment_status: string
  currency: string
  total_cents: string
  notes: string | null
  ordered_at: string
  fulfilled_at: string | null
  contact_name: string | null
  contact_phone: string | null
}

interface ItemLedgerRow {
  order_number: string
  quantity: number
  total_cents: string
  ordered_at: string
  contact_name: string | null
}

interface ReceivableDocRow {
  id: string
  document_number: string
  total_cents: string
  created_at: string
  contact_name: string | null
}

export async function salesErpRoutes(fastify: FastifyInstance) {
  // ── GET /api/studio/sales/orders ────────────────────────────────────────────
  fastify.get(
    '/api/studio/sales/orders',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const query = request.query as Record<string, string>
      const status = query.status || 'all'

      let sql = `
        SELECT so.id, so.order_number, so.contact_id, so.status, so.fulfillment_status,
               so.currency, so.total_cents, so.notes, so.ordered_at, so.fulfilled_at,
               c.display_name AS contact_name, c.phone_number AS contact_phone
        FROM sales_orders so
        LEFT JOIN contacts c ON c.id = so.contact_id
        WHERE so.user_id = $1
      `
      const params: unknown[] = [userId]

      if (status !== 'all') {
        sql += ` AND so.status = $2`
        params.push(status)
      }

      sql += ` ORDER BY so.ordered_at DESC LIMIT 100`

      const { rows } = await db.query<OrderRow>(sql, params)

      return reply.send({
        orders: rows.map((o: OrderRow) => ({
          id: o.id,
          orderNumber: o.order_number,
          contactId: o.contact_id,
          contactName: o.contact_name || o.contact_phone || 'Unassigned',
          status: o.status,
          fulfillmentStatus: o.fulfillment_status,
          currency: o.currency,
          totalCents: parseInt(o.total_cents, 10),
          notes: o.notes,
          orderedAt: o.ordered_at,
          fulfilledAt: o.fulfilled_at,
        })),
      })
    },
  )

  // ── POST /api/studio/sales/orders ───────────────────────────────────────────
  fastify.post(
    '/api/studio/sales/orders',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = request.body as {
        contactId?: string
        quotationId?: string
        currency?: string
        items: Array<{
          productId?: string
          serviceId?: string
          description: string
          quantity: number
          unitPriceCents: number
        }>
        notes?: string
      }

      if (!body.items || body.items.length === 0) {
        return reply.code(400).send({ error: 'Order must contain at least one line item' })
      }

      const orderNumber = `SO-${Date.now().toString().slice(-6)}`
      const currency = body.currency || 'ZMW'

      let subtotalCents = 0
      body.items.forEach(i => { subtotalCents += (i.quantity * i.unitPriceCents) })
      const totalCents = subtotalCents

      const { rows: [order] } = await db.query<{ id: string; order_number: string }>(
        `INSERT INTO sales_orders (user_id, contact_id, order_number, quotation_id, currency, subtotal_cents, total_cents, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, order_number`,
        [userId, body.contactId || null, orderNumber, body.quotationId || null, currency, subtotalCents, totalCents, body.notes || null],
      )

      for (const item of body.items) {
        const itemTotal = item.quantity * item.unitPriceCents
        await db.query(
          `INSERT INTO sales_order_items (sales_order_id, product_id, description, quantity, unit_price_cents, total_cents)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, item.productId || null, item.description, item.quantity, item.unitPriceCents, itemTotal],
        )

        // Decrement product stock if product_id provided
        if (item.productId) {
          await db.query(
            `UPDATE products SET stock = GREATEST(0, stock - $1), updated_at = NOW() WHERE id = $2 AND user_id = $3`,
            [item.quantity, item.productId, userId],
          )
        }
      }

      return reply.send({ ok: true, orderId: order.id, orderNumber: order.order_number })
    },
  )

  // ── POST /api/studio/sales/orders/:id/status ──────────────────────────────
  fastify.post(
    '/api/studio/sales/orders/:id/status',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = request.body as { fulfillmentStatus?: string; status?: string }

      const fulfillmentStatus = body.fulfillmentStatus || 'fulfilled'
      const status = body.status || 'confirmed'

      await db.query(
        `UPDATE sales_orders
         SET fulfillment_status = $1, status = $2, fulfilled_at = NOW(), updated_at = NOW()
         WHERE id = $3 AND user_id = $4`,
        [fulfillmentStatus, status, id, userId],
      )

      return reply.send({ ok: true })
    },
  )

  // ── GET /api/studio/catalog/:id/ledger ─────────────────────────────────────
  fastify.get(
    '/api/studio/catalog/:id/ledger',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      // Fetch product or service info
      const { rows: [prod] } = await db.query<{ id: string; name: string }>(
        `SELECT id, name FROM products WHERE id = $1 AND user_id = $2
         UNION ALL
         SELECT id, name FROM services WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )

      const { rows: sales } = await db.query<ItemLedgerRow>(
        `SELECT so.order_number, soi.quantity, soi.total_cents, so.ordered_at, c.display_name AS contact_name
         FROM sales_order_items soi
         JOIN sales_orders so ON so.id = soi.sales_order_id
         LEFT JOIN contacts c ON c.id = so.contact_id
         WHERE soi.product_id = $1 AND so.user_id = $2
         ORDER BY so.ordered_at DESC LIMIT 50`,
        [id, userId],
      )

      const totalRevenue = sales.reduce((acc: number, s: ItemLedgerRow) => acc + parseInt(s.total_cents, 10), 0)
      const totalUnitsSold = sales.reduce((acc: number, s: ItemLedgerRow) => acc + s.quantity, 0)

      return reply.send({
        itemId: id,
        itemName: prod?.name || 'Item',
        totalRevenueCents: totalRevenue,
        totalUnitsSold,
        salesHistory: sales.map((s: ItemLedgerRow) => ({
          orderNumber: s.order_number,
          quantity: s.quantity,
          totalCents: parseInt(s.total_cents, 10),
          orderedAt: s.ordered_at,
          contactName: s.contact_name || 'Direct Customer',
        })),
      })
    },
  )

  // ── GET /api/studio/receivables/aging ──────────────────────────────────────
  fastify.get(
    '/api/studio/receivables/aging',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const { rows: docs } = await db.query<ReceivableDocRow>(
        `SELECT bd.id, bd.document_number, bd.total_cents, bd.created_at, c.display_name AS contact_name
         FROM documents bd
         LEFT JOIN contacts c ON c.id = bd.contact_id
         WHERE bd.user_id = $1 AND bd.document_type = 'invoice' AND bd.status IN ('sent', 'viewed', 'generated')
         ORDER BY bd.created_at ASC`,
        [userId],
      )

      const now = Date.now()
      let currentCents = 0
      let overdue30Cents = 0
      let overdue60Cents = 0
      let overdue90Cents = 0

      const items = docs.map((d: ReceivableDocRow) => {
        const days = Math.floor((now - new Date(d.created_at).getTime()) / 86400000)
        const amt = parseInt(d.total_cents, 10)

        if (days <= 30) currentCents += amt
        else if (days <= 60) overdue30Cents += amt
        else if (days <= 90) overdue60Cents += amt
        else overdue90Cents += amt

        return {
          id: d.id,
          documentNumber: d.document_number,
          totalCents: amt,
          daysOverdue: days,
          contactName: d.contact_name || 'Customer',
          createdAt: d.created_at,
        }
      })

      return reply.send({
        summary: {
          currentCents,
          overdue30Cents,
          overdue60Cents,
          overdue90Cents,
          totalReceivablesCents: currentCents + overdue30Cents + overdue60Cents + overdue90Cents,
        },
        items,
      })
    },
  )

  // ── GET /api/contacts/:id/financial-ledger ──────────────────────────────────
  fastify.get(
    '/api/contacts/:id/financial-ledger',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id: contactId } = request.params as { id: string }

      const [
        { rows: docs },
        { rows: receipts },
        { rows: orders },
      ] = await Promise.all([
        db.query<{ id: string; document_type: string; document_number: string; status: string; total_cents: string; created_at: string }>(
          `SELECT id, document_type, document_number, status, total_cents, created_at FROM documents WHERE contact_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
          [contactId, userId],
        ),
        db.query<{ id: string; receipt_number: string; payment_method: string; amount_cents: string; paid_at: string }>(
          `SELECT id, receipt_number, payment_method, amount_cents, paid_at FROM payment_receipts WHERE contact_id = $1 AND user_id = $2 ORDER BY paid_at DESC`,
          [contactId, userId],
        ),
        db.query<{ id: string; order_number: string; status: string; total_cents: string; ordered_at: string }>(
          `SELECT id, order_number, status, total_cents, ordered_at FROM sales_orders WHERE contact_id = $1 AND user_id = $2 ORDER BY ordered_at DESC`,
          [contactId, userId],
        ),
      ])

      const totalSpentCents = receipts.reduce((acc: number, r: { amount_cents: string }) => acc + parseInt(r.amount_cents, 10), 0)
      const openInvoicesCents = docs
        .filter((d: { document_type: string; status: string }) => d.document_type === 'invoice' && ['sent', 'viewed', 'generated'].includes(d.status))
        .reduce((acc: number, d: { total_cents: string }) => acc + parseInt(d.total_cents, 10), 0)

      return reply.send({
        contactId,
        customerLifetimeValueCents: totalSpentCents,
        openInvoicesCents,
        documents: docs.map((d: { id: string; document_type: string; document_number: string; status: string; total_cents: string; created_at: string }) => ({
          id: d.id,
          type: d.document_type,
          number: d.document_number,
          status: d.status,
          totalCents: parseInt(d.total_cents, 10),
          createdAt: d.created_at,
        })),
        receipts: receipts.map((r: { id: string; receipt_number: string; payment_method: string; amount_cents: string; paid_at: string }) => ({
          id: r.id,
          receiptNumber: r.receipt_number,
          paymentMethod: r.payment_method,
          amountCents: parseInt(r.amount_cents, 10),
          paidAt: r.paid_at,
        })),
        orders: orders.map((o: { id: string; order_number: string; status: string; total_cents: string; ordered_at: string }) => ({
          id: o.id,
          orderNumber: o.order_number,
          status: o.status,
          totalCents: parseInt(o.total_cents, 10),
          orderedAt: o.ordered_at,
        })),
      })
    },
  )
}
