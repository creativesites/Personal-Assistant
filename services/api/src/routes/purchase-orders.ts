import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'
import { assignDocumentNumber, computeTotals, formatDocument } from './documents'

// Business OS Phase B — purchase order workflow. See docs/BUSINESS_OS_PLAN.md
// §8.3. A PO is a `documents` row (document_type = 'purchase_order',
// document_category = 'operations', supplier_id set instead of contact_id) —
// no parallel table, same convention as quotations/invoices.
//
// Lifecycle: draft (created) -> sent (approved — writes an `in_transit`
// stock movement per line and bumps products.incoming, so "incoming" stock
// reflects the order immediately) -> accepted (goods received — writes a
// `restock` movement per line, unwinds `incoming`). `accepted` is reused
// from the existing documents.status vocabulary rather than adding a new
// status value just for this document type.

const createBody = z.object({
  supplierId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
    unitCostCents: z.number().int().nonnegative().optional(),
  })).min(1),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
  autoApprove: z.boolean().optional(),
  projectId: z.string().uuid().optional(),
})

type ApproveResult = { error: string; status: number } | { document: any }

async function approvePurchaseOrder(userId: string, id: string): Promise<ApproveResult> {
  const { rows: [doc] } = await db.query(
    'SELECT * FROM documents WHERE id = $1 AND user_id = $2 AND document_type = $3',
    [id, userId, 'purchase_order'],
  )
  if (!doc) return { error: 'Purchase order not found', status: 404 }
  if (doc.status !== 'draft') return { error: 'Only a draft purchase order can be approved', status: 400 }

  const items = (doc.structured_data?.items ?? []) as Array<{ productId?: string; quantity: number }>

  for (const item of items) {
    if (!item.productId) continue
    const { rows: [product] } = await db.query(
      'SELECT stock, reserved FROM products WHERE id = $1 AND user_id = $2',
      [item.productId, userId],
    )
    if (!product) continue

    await db.query(
      `INSERT INTO stock_movements (user_id, product_id, movement_type, quantity_delta, previous_stock, new_stock, reason)
       VALUES ($1, $2, 'in_transit', $3, $4, $4, $5)`,
      [userId, item.productId, Math.round(item.quantity), product.stock, `Purchase order ${doc.document_number}`],
    )
    await db.query(
      'UPDATE products SET incoming = incoming + $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      [Math.round(item.quantity), item.productId, userId],
    )
  }

  const { rows: [updated] } = await db.query(
    `UPDATE documents SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id],
  )
  await db.query(
    `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'sent', '{}')`,
    [id],
  )

  return { document: updated }
}

export async function purchaseOrdersRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /api/purchase-orders — create a draft PO, optionally
  // auto-approving it in the same request (the "one tap" flow from a
  // suggested-reorder insight card). ──
  fastify.post(
    '/api/purchase-orders',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = createBody.parse(request.body)

      const { rows: [supplier] } = await db.query(
        'SELECT id, company FROM suppliers WHERE id = $1 AND user_id = $2',
        [body.supplierId, userId],
      )
      if (!supplier) return reply.code(404).send({ error: 'Supplier not found' })

      const lineItems = []
      for (const item of body.items) {
        const { rows: [product] } = await db.query(
          'SELECT id, name, purchase_cost FROM products WHERE id = $1 AND user_id = $2',
          [item.productId, userId],
        )
        if (!product) return reply.code(404).send({ error: `Product ${item.productId} not found` })

        let unitCostCents = item.unitCostCents
        if (unitCostCents === undefined) {
          const { rows: [sp] } = await db.query(
            'SELECT cost FROM supplier_products WHERE supplier_id = $1 AND product_id = $2',
            [body.supplierId, item.productId],
          )
          const cost = sp?.cost != null ? Number(sp.cost) : Number(product.purchase_cost ?? 0)
          unitCostCents = Math.round(cost * 100)
        }

        lineItems.push({
          productId: product.id,
          description: product.name,
          quantity: item.quantity,
          unitPriceCents: unitCostCents,
        })
      }

      const { computedItems, subtotalCents, discountCents, taxCents, totalCents } = computeTotals(lineItems)
      const documentNumber = await assignDocumentNumber(userId, 'purchase_order')
      const title = `Purchase Order ${documentNumber} — ${supplier.company}`

      const structuredData = {
        items: computedItems,
        supplierName: supplier.company,
        notes: body.notes ?? null,
        expectedDeliveryDate: body.expectedDeliveryDate ?? null,
      }

      const { rows: [doc] } = await db.query(
        `INSERT INTO documents
           (user_id, supplier_id, project_id, document_type, document_category, document_number, title, status,
            structured_data, currency, subtotal_cents, discount_cents, tax_cents, total_cents,
            requested_by, ai_generated)
         VALUES ($1, $2, $3, 'purchase_order', 'operations', $4, $5, 'draft', $6, 'ZMW', $7, $8, $9, $10, 'user', false)
         RETURNING *`,
        [userId, body.supplierId, body.projectId ?? null, documentNumber, title, JSON.stringify(structuredData),
          subtotalCents, discountCents, taxCents, totalCents],
      )

      await db.query(
        `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'created', '{}')`,
        [doc.id],
      )

      if (body.autoApprove) {
        const result = await approvePurchaseOrder(userId, doc.id)
        if ('error' in result) return reply.code(result.status).send({ error: result.error })
        return reply.code(201).send({ document: formatDocument(result.document) })
      }

      return reply.code(201).send({ document: formatDocument(doc) })
    },
  )

  // ── POST /api/purchase-orders/:id/approve — draft -> sent, writes
  // in_transit movements + bumps products.incoming. ──
  fastify.post(
    '/api/purchase-orders/:id/approve',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const result = await approvePurchaseOrder(userId, id)
      if ('error' in result) return reply.code(result.status).send({ error: result.error })
      return reply.send({ document: formatDocument(result.document) })
    },
  )

  // ── POST /api/purchase-orders/:id/receive — sent -> accepted (reused to
  // mean "goods received"), writes `restock` movements + unwinds incoming. ──
  fastify.post(
    '/api/purchase-orders/:id/receive',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows: [doc] } = await db.query(
        'SELECT * FROM documents WHERE id = $1 AND user_id = $2 AND document_type = $3',
        [id, userId, 'purchase_order'],
      )
      if (!doc) return reply.code(404).send({ error: 'Purchase order not found' })
      if (doc.status !== 'sent') return reply.code(400).send({ error: 'Only an approved (sent) purchase order can be received' })

      const items = (doc.structured_data?.items ?? []) as Array<{ productId?: string; quantity: number }>

      for (const item of items) {
        if (!item.productId) continue
        const { rows: [product] } = await db.query(
          'SELECT stock, reserved, incoming FROM products WHERE id = $1 AND user_id = $2',
          [item.productId, userId],
        )
        if (!product) continue

        const qty = Math.round(item.quantity)
        const newStock = product.stock + qty
        const newAvailable = Math.max(0, newStock - product.reserved)
        const newIncoming = Math.max(0, product.incoming - qty)

        await db.query(
          `INSERT INTO stock_movements (user_id, product_id, movement_type, quantity_delta, previous_stock, new_stock, reason)
           VALUES ($1, $2, 'restock', $3, $4, $5, $6)`,
          [userId, item.productId, qty, product.stock, newStock, `Received purchase order ${doc.document_number}`],
        )
        await db.query(
          `UPDATE products SET stock = $1, quantity = $1, available = $2, incoming = $3, updated_at = NOW()
           WHERE id = $4 AND user_id = $5`,
          [newStock, newAvailable, newIncoming, item.productId, userId],
        )
      }

      const { rows: [updated] } = await db.query(
        `UPDATE documents SET status = 'accepted', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id],
      )
      await db.query(
        `INSERT INTO document_events (document_id, event_type, metadata) VALUES ($1, 'received', '{}')`,
        [id],
      )

      return reply.send({ document: formatDocument(updated) })
    },
  )
}
