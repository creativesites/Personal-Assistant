import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'
import { requireFeature } from '../lib/entitlements'
import { coPurchasers } from '../lib/knowledge-graph'
import { reserveStock } from '../lib/stock'

const createBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  price: z.number().nonnegative().optional().nullable(),
  currency: z.string().max(10).optional(),
  serialNumber: z.string().max(255).optional().nullable(),
  quantity: z.number().int().nonnegative().optional(),
  images: z.array(z.string()).optional(),
  // New fields
  sku: z.string().max(100).optional().nullable(),
  barcode: z.string().max(100).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  itemType: z.enum(['product', 'service', 'bundle', 'subscription', 'package', 'digital_product']).default('product'),
  videos: z.array(z.string()).optional(),
  stock: z.number().int().nonnegative().optional(),
  reserved: z.number().int().nonnegative().optional(),
  available: z.number().int().optional(),
  minimumStock: z.number().int().nonnegative().optional(),
  maximumStock: z.number().int().nonnegative().optional().nullable(),
  leadTime: z.number().int().nonnegative().optional(),
  supplierLeadTime: z.number().int().nonnegative().optional(),
  purchaseCost: z.number().nonnegative().optional(),
  sellingPrice: z.number().nonnegative().optional().nullable(),
  margin: z.number().optional().nullable(),
  discountRules: z.array(z.any()).optional(),
  crossSell: z.array(z.any()).optional(),
  upsell: z.array(z.any()).optional(),
  replacementProductId: z.string().uuid().optional().nullable(),
  relatedProducts: z.array(z.any()).optional(),
  warranty: z.string().max(100).optional().nullable(),
  manual: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  serviceDetails: z.record(z.any()).optional(),
  inventoryDetails: z.record(z.any()).optional(),
  pricingDetails: z.record(z.any()).optional(),
  aiNotes: z.string().optional().nullable(),
  marketingCopy: z.string().optional().nullable(),
  minPrice: z.number().nonnegative().optional().nullable(),
  maxPrice: z.number().nonnegative().optional().nullable(),
  discountMinPct: z.number().min(0).max(100).optional(),
  discountMaxPct: z.number().min(0).max(100).optional(),
  // Business OS Phase A — configurable families & attributes (see
  // docs/BUSINESS_OS_PLAN.md §5)
  familyId: z.string().uuid().optional().nullable(),
  attributes: z.record(z.any()).optional(),
  // Services Management System (see docs/SERVICES_PROJECTS_PLAN.md) —
  // pricingModel is meaningful only for itemType='service' (and siblings);
  // trackInventory is the single conditional the rest of Studio's inventory
  // UI/insights/forecasts gate on.
  pricingModel: z.enum(['fixed', 'hourly', 'daily', 'subscription', 'milestone', 'quote', 'recurring']).optional().nullable(),
  trackInventory: z.boolean().optional(),
  // Business Events Plan §6 — a chat-detected product is created with
  // status='secondary' (recorded, hidden from the main catalog grid by
  // default) rather than landing directly in 'active'.
  status: z.enum(['active', 'secondary', 'archived', 'discontinued']).optional(),
})

const patchBody = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  price: z.number().nonnegative().optional().nullable(),
  currency: z.string().max(10).optional(),
  serialNumber: z.string().max(255).optional().nullable(),
  quantity: z.number().int().nonnegative().optional(),
  images: z.array(z.string()).optional(),
  status: z.enum(['active', 'secondary', 'archived', 'discontinued']).optional(),
  // New fields
  sku: z.string().max(100).optional().nullable(),
  barcode: z.string().max(100).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  itemType: z.enum(['product', 'service', 'bundle', 'subscription', 'package', 'digital_product']).optional(),
  videos: z.array(z.string()).optional(),
  stock: z.number().int().nonnegative().optional(),
  reserved: z.number().int().nonnegative().optional(),
  available: z.number().int().optional(),
  minimumStock: z.number().int().nonnegative().optional(),
  maximumStock: z.number().int().nonnegative().optional().nullable(),
  leadTime: z.number().int().nonnegative().optional(),
  supplierLeadTime: z.number().int().nonnegative().optional(),
  purchaseCost: z.number().nonnegative().optional(),
  sellingPrice: z.number().nonnegative().optional().nullable(),
  margin: z.number().optional().nullable(),
  discountRules: z.array(z.any()).optional(),
  crossSell: z.array(z.any()).optional(),
  upsell: z.array(z.any()).optional(),
  replacementProductId: z.string().uuid().optional().nullable(),
  relatedProducts: z.array(z.any()).optional(),
  warranty: z.string().max(100).optional().nullable(),
  manual: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  serviceDetails: z.record(z.any()).optional(),
  inventoryDetails: z.record(z.any()).optional(),
  pricingDetails: z.record(z.any()).optional(),
  aiNotes: z.string().optional().nullable(),
  marketingCopy: z.string().optional().nullable(),
  minPrice: z.number().nonnegative().optional().nullable(),
  maxPrice: z.number().nonnegative().optional().nullable(),
  discountMinPct: z.number().min(0).max(100).optional(),
  discountMaxPct: z.number().min(0).max(100).optional(),
  familyId: z.string().uuid().optional().nullable(),
  attributes: z.record(z.any()).optional(),
  pricingModel: z.enum(['fixed', 'hourly', 'daily', 'subscription', 'milestone', 'quote', 'recurring']).optional().nullable(),
  trackInventory: z.boolean().optional(),
})

const generateVariantsBody = z.object({
  // e.g. { color: ["Red", "Blue"], size: ["S", "M", "L"] } — keys must match
  // is_variant_axis attribute keys on the product's family.
  axisValues: z.record(z.array(z.string()).min(1)),
})

const linkContactBody = z.object({
  contactId: z.string().uuid(),
  relationType: z.enum(['purchased', 'interested', 'quoted', 'recommended', 'mentioned']).default('interested'),
  quantity: z.number().int().positive().optional(),
})

type ProductRow = {
  id: string
  name: string
  description: string | null
  price: string | null
  currency: string
  serial_number: string | null
  quantity: number
  images: string[]
  status: string
  whatsapp_catalog_product_id: string | null
  whatsapp_catalog_synced_at: string | null
  whatsapp_catalog_status: string
  whatsapp_catalog_error: string | null
  created_at: string
  updated_at: string
  linked_contacts?: string
  attributed_leads?: string
  // New fields
  sku?: string | null
  barcode?: string | null
  category?: string | null
  supplier_id?: string | null
  brand?: string | null
  item_type?: string
  videos?: string[]
  stock?: number
  reserved?: number
  available?: number
  minimum_stock?: number
  maximum_stock?: number | null
  lead_time?: number
  supplier_lead_time?: number
  purchase_cost?: string | null
  selling_price?: string | null
  margin?: string | null
  discount_rules?: any[]
  cross_sell?: any[]
  upsell?: any[]
  replacement_product_id?: string | null
  related_products?: any[]
  warranty?: string | null
  manual?: string | null
  tags?: string[]
  service_details?: Record<string, any>
  inventory_details?: Record<string, any>
  pricing_details?: Record<string, any>
  ai_notes?: string | null
  marketing_copy?: string | null
  min_price?: string | null
  max_price?: string | null
  discount_min_pct?: string | null
  discount_max_pct?: string | null
  family_id?: string | null
  attributes?: Record<string, any>
  parent_product_id?: string | null
  variant_count?: string
  incoming?: number
  pricing_model?: string | null
  track_inventory?: boolean
}

function toApiShape(p: ProductRow) {
  const stockVal = p.stock !== undefined && p.stock !== null ? p.stock : p.quantity;
  const priceVal = p.selling_price !== undefined && p.selling_price !== null ? Number(p.selling_price) : (p.price !== null ? Number(p.price) : null);

  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price !== null ? Number(p.price) : null,
    currency: p.currency,
    serialNumber: p.serial_number,
    quantity: p.quantity,
    images: p.images,
    status: p.status,
    whatsappCatalogProductId: p.whatsapp_catalog_product_id,
    whatsappCatalogSyncedAt: p.whatsapp_catalog_synced_at,
    whatsappCatalogStatus: p.whatsapp_catalog_status,
    whatsappCatalogError: p.whatsapp_catalog_error,
    linkedContacts: p.linked_contacts !== undefined ? Number(p.linked_contacts) : undefined,
    attributedLeads: p.attributed_leads !== undefined ? Number(p.attributed_leads) : undefined,
    createdAt: p.created_at,
    updatedAt: p.updated_at,

    // New fields
    sku: p.sku ?? null,
    barcode: p.barcode ?? null,
    category: p.category ?? null,
    supplierId: p.supplier_id ?? null,
    brand: p.brand ?? null,
    itemType: p.item_type ?? 'product',
    videos: p.videos ?? [],
    stock: stockVal,
    reserved: p.reserved ?? 0,
    available: p.available ?? (stockVal - (p.reserved ?? 0)),
    minimumStock: p.minimum_stock ?? 0,
    maximumStock: p.maximum_stock ?? null,
    leadTime: p.lead_time ?? 1,
    supplierLeadTime: p.supplier_lead_time ?? 5,
    purchaseCost: p.purchase_cost !== null && p.purchase_cost !== undefined ? Number(p.purchase_cost) : 0,
    sellingPrice: priceVal,
    margin: p.margin !== null && p.margin !== undefined ? Number(p.margin) : null,
    discountRules: p.discount_rules ?? [],
    crossSell: p.cross_sell ?? [],
    upsell: p.upsell ?? [],
    replacementProductId: p.replacement_product_id ?? null,
    relatedProducts: p.related_products ?? [],
    warranty: p.warranty ?? null,
    manual: p.manual ?? null,
    tags: p.tags ?? [],
    serviceDetails: p.service_details ?? {},
    inventoryDetails: p.inventory_details ?? {},
    pricingDetails: p.pricing_details ?? {},
    aiNotes: p.ai_notes ?? null,
    marketingCopy: p.marketing_copy ?? null,
    minPrice: p.min_price != null ? Number(p.min_price) : null,
    maxPrice: p.max_price != null ? Number(p.max_price) : null,
    discountMinPct: p.discount_min_pct != null ? Number(p.discount_min_pct) : 0,
    discountMaxPct: p.discount_max_pct != null ? Number(p.discount_max_pct) : 0,

    // Business OS Phase A
    familyId: p.family_id ?? null,
    attributes: p.attributes ?? {},
    parentProductId: p.parent_product_id ?? null,
    variantCount: p.variant_count !== undefined ? Number(p.variant_count) : undefined,

    // Business OS Phase B
    incoming: p.incoming ?? 0,

    // Services Management System
    pricingModel: p.pricing_model ?? null,
    trackInventory: p.track_inventory ?? true,
  }
}

export async function productsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/products',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      // Business Events Plan §6 — a 'secondary' product (a one-off item
      // recorded but not meant to clutter the main catalog) is excluded by
      // default, same as 'archived' already is; ?includeSecondary=true
      // reveals it (the Catalog tab's "Show secondary items" toggle).
      const { includeSecondary } = request.query as { includeSecondary?: string }
      const statusFilter = includeSecondary === 'true'
        ? `p.status != 'archived'`
        : `p.status NOT IN ('archived', 'secondary')`

      const { rows } = await db.query<ProductRow>(
        `SELECT p.id, p.name, p.description, p.price, p.currency, p.serial_number, p.quantity,
                p.images, p.status, p.whatsapp_catalog_product_id, p.whatsapp_catalog_synced_at,
                p.whatsapp_catalog_status, p.whatsapp_catalog_error, p.created_at, p.updated_at,
                p.sku, p.barcode, p.category, p.supplier_id, p.brand, p.item_type, p.videos,
                p.stock, p.reserved, p.available, p.minimum_stock, p.maximum_stock, p.lead_time,
                p.supplier_lead_time, p.purchase_cost, p.selling_price, p.margin, p.discount_rules,
                p.cross_sell, p.upsell, p.replacement_product_id, p.related_products, p.warranty,
                p.manual, p.tags, p.service_details, p.inventory_details, p.pricing_details,
                p.ai_notes, p.marketing_copy, p.min_price, p.max_price,
                p.discount_min_pct, p.discount_max_pct,
                p.family_id, p.attributes, p.parent_product_id, p.incoming,
                p.pricing_model, p.track_inventory,
                COUNT(DISTINCT cp.contact_id) AS linked_contacts,
                COUNT(DISTINCT co.id) FILTER (WHERE co.source_product_id = p.id) AS attributed_leads,
                COUNT(DISTINCT v.id) AS variant_count
         FROM products p
         LEFT JOIN contact_products cp ON cp.product_id = p.id AND cp.user_id = p.user_id
         LEFT JOIN contacts co ON co.source_product_id = p.id AND co.user_id = p.user_id
         LEFT JOIN products v ON v.parent_product_id = p.id AND v.status != 'archived'
         WHERE p.user_id = $1 AND ${statusFilter} AND p.parent_product_id IS NULL
         GROUP BY p.id
         ORDER BY p.created_at DESC`,
        [userId],
      )

      return reply.send({ products: rows.map(toApiShape) })
    },
  )

  // ── GET /api/products/:id/variants — child rows generated from the base
  // product's variant-axis attributes (see generate-variants below). ──
  fastify.get(
    '/api/products/:id/variants',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows } = await db.query<ProductRow>(
        `SELECT p.id, p.name, p.description, p.price, p.currency, p.serial_number, p.quantity,
                p.images, p.status, p.whatsapp_catalog_product_id, p.whatsapp_catalog_synced_at,
                p.whatsapp_catalog_status, p.whatsapp_catalog_error, p.created_at, p.updated_at,
                p.sku, p.barcode, p.category, p.supplier_id, p.brand, p.item_type, p.videos,
                p.stock, p.reserved, p.available, p.minimum_stock, p.maximum_stock, p.lead_time,
                p.supplier_lead_time, p.purchase_cost, p.selling_price, p.margin, p.discount_rules,
                p.cross_sell, p.upsell, p.replacement_product_id, p.related_products, p.warranty,
                p.manual, p.tags, p.service_details, p.inventory_details, p.pricing_details,
                p.ai_notes, p.marketing_copy, p.min_price, p.max_price,
                p.discount_min_pct, p.discount_max_pct,
                p.family_id, p.attributes, p.parent_product_id, p.incoming,
                p.pricing_model, p.track_inventory
         FROM products p
         WHERE p.user_id = $1 AND p.parent_product_id = $2 AND p.status != 'archived'
         ORDER BY p.name ASC`,
        [userId, id],
      )

      return reply.send({ variants: rows.map(toApiShape) })
    },
  )

  // ── POST /api/products/:id/generate-variants — cartesian-product variant
  // generation off a base product's family variant-axis attributes (e.g.
  // Size x Color). See docs/BUSINESS_OS_PLAN.md §5. ──
  fastify.post(
    '/api/products/:id/generate-variants',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = generateVariantsBody.parse(request.body)

      const { rows: [base] } = await db.query<ProductRow>(
        `SELECT * FROM products WHERE id = $1 AND user_id = $2`,
        [id, userId],
      )
      if (!base) return reply.code(404).send({ error: 'Product not found' })
      if (base.parent_product_id) {
        return reply.code(400).send({ error: 'Cannot generate variants on a variant product' })
      }
      if (!base.family_id) {
        return reply.code(400).send({ error: 'Product has no family — assign a family with variant-axis attributes first' })
      }

      const { rows: axisDefs } = await db.query<{ key: string; label: string }>(
        `SELECT key, label FROM product_attribute_definitions
         WHERE user_id = $1 AND family_id = $2 AND is_variant_axis = true`,
        [userId, base.family_id],
      )
      if (axisDefs.length === 0) {
        return reply.code(400).send({ error: 'This product\'s family has no variant-axis attributes defined' })
      }

      const axisKeys = axisDefs.map(a => a.key)
      const unknownKeys = Object.keys(body.axisValues).filter(k => !axisKeys.includes(k))
      if (unknownKeys.length > 0) {
        return reply.code(400).send({ error: `Unknown variant axis keys: ${unknownKeys.join(', ')}` })
      }
      const missingKeys = axisKeys.filter(k => !body.axisValues[k]?.length)
      if (missingKeys.length > 0) {
        return reply.code(400).send({ error: `Missing values for variant axes: ${missingKeys.join(', ')}` })
      }

      // Cartesian product across axes, in axis-definition order.
      let combinations: Record<string, string>[] = [{}]
      for (const key of axisKeys) {
        const values = body.axisValues[key]
        const next: Record<string, string>[] = []
        for (const combo of combinations) {
          for (const value of values) {
            next.push({ ...combo, [key]: value })
          }
        }
        combinations = next
      }

      const baseAttributes = base.attributes ?? {}
      const created: ProductRow[] = []
      for (const combo of combinations) {
        const suffix = axisKeys.map(k => combo[k]).join(' / ')
        const variantName = `${base.name} (${suffix})`
        const variantSku = base.sku ? `${base.sku}-${axisKeys.map(k => combo[k]).join('-')}`.replace(/\s+/g, '') : null

        const { rows: [variant] } = await db.query<ProductRow>(
          `INSERT INTO products (
             user_id, name, description, currency, images,
             sku, barcode, category, supplier_id, brand, item_type, videos,
             stock, reserved, available, minimum_stock, maximum_stock, lead_time, supplier_lead_time,
             purchase_cost, selling_price, price, margin, warranty, manual, tags,
             family_id, attributes, parent_product_id
           )
           VALUES (
             $1, $2, $3, $4, $5::jsonb,
             $6, $7, $8, $9, $10, $11, $12::jsonb,
             $13, $14, $15, $16, $17, $18, $19,
             $20, $21, $22, $23, $24, $25, $26::text[],
             $27, $28::jsonb, $29
           )
           RETURNING *`,
          [
            userId, variantName, base.description, base.currency, JSON.stringify(base.images ?? []),
            variantSku, base.barcode, base.category, base.supplier_id, base.brand, base.item_type, JSON.stringify(base.videos ?? []),
            0, 0, 0, base.minimum_stock ?? 0, base.maximum_stock ?? null, base.lead_time ?? 1, base.supplier_lead_time ?? 5,
            base.purchase_cost ?? 0, base.selling_price, base.selling_price, base.margin, base.warranty, base.manual, base.tags ?? [],
            base.family_id, JSON.stringify({ ...baseAttributes, ...combo }), base.id,
          ],
        )
        created.push(variant)
      }

      return reply.code(201).send({ variants: created.map(toApiShape) })
    },
  )

  fastify.post(
    '/api/products',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const body = createBody.parse(request.body)

      const finalPrice = body.sellingPrice !== undefined && body.sellingPrice !== null ? body.sellingPrice : (body.price !== undefined ? body.price : null);
      const finalStock = body.stock !== undefined ? body.stock : (body.quantity !== undefined ? body.quantity : 1);
      const finalAvailable = finalStock - (body.reserved ?? 0);

      const { rows: [product] } = await db.query<ProductRow>(
        `INSERT INTO products (
           user_id, name, description, price, currency, serial_number, quantity, images,
           sku, barcode, category, supplier_id, brand, item_type, videos, stock, reserved,
           available, minimum_stock, maximum_stock, lead_time, supplier_lead_time,
           purchase_cost, selling_price, margin, discount_rules, cross_sell, upsell,
           replacement_product_id, related_products, warranty, manual, tags,
           service_details, inventory_details, pricing_details, ai_notes, marketing_copy,
           family_id, attributes, pricing_model, track_inventory, status
         )
         VALUES (
           $1, $2, $3, $4, COALESCE($5, 'ZMW'), $6, $7, COALESCE($8::jsonb, '[]'::jsonb),
           $9, $10, $11, $12, $13, COALESCE($14, 'product'), COALESCE($15::jsonb, '[]'::jsonb),
           $16, $17, $18, COALESCE($19, 0), $20, COALESCE($21, 1), COALESCE($22, 5),
           COALESCE($23, 0.00), $24, $25, COALESCE($26::jsonb, '[]'::jsonb), COALESCE($27::jsonb, '[]'::jsonb),
           COALESCE($28::jsonb, '[]'::jsonb), $29, COALESCE($30::jsonb, '[]'::jsonb), $31, $32,
           COALESCE($33::text[], '{}'::text[]), COALESCE($34::jsonb, '{}'::jsonb), COALESCE($35::jsonb, '{}'::jsonb),
           COALESCE($36::jsonb, '{}'::jsonb), $37, $38,
           $39, COALESCE($40::jsonb, '{}'::jsonb), $41, $42, COALESCE($43, 'active')
         )
         RETURNING *`,
        [
          userId,
          body.name,
          body.description ?? null,
          finalPrice,
          body.currency ?? null,
          body.serialNumber ?? null,
          finalStock,
          body.images ? JSON.stringify(body.images) : null,
          // New fields
          body.sku ?? null,
          body.barcode ?? null,
          body.category ?? null,
          body.supplierId ?? null,
          body.brand ?? null,
          body.itemType ?? 'product',
          body.videos ? JSON.stringify(body.videos) : null,
          finalStock,
          body.reserved ?? 0,
          finalAvailable,
          body.minimumStock ?? null,
          body.maximumStock ?? null,
          body.leadTime ?? null,
          body.supplierLeadTime ?? null,
          body.purchaseCost ?? null,
          finalPrice,
          body.margin ?? null,
          body.discountRules ? JSON.stringify(body.discountRules) : null,
          body.crossSell ? JSON.stringify(body.crossSell) : null,
          body.upsell ? JSON.stringify(body.upsell) : null,
          body.replacementProductId ?? null,
          body.relatedProducts ? JSON.stringify(body.relatedProducts) : null,
          body.warranty ?? null,
          body.manual ?? null,
          body.tags ?? null,
          body.serviceDetails ? JSON.stringify(body.serviceDetails) : null,
          body.inventoryDetails ? JSON.stringify(body.inventoryDetails) : null,
          body.pricingDetails ? JSON.stringify(body.pricingDetails) : null,
          body.aiNotes ?? null,
          body.marketingCopy ?? null,
          body.familyId ?? null,
          body.attributes ? JSON.stringify(body.attributes) : null,
          body.pricingModel ?? null,
          body.trackInventory !== undefined ? body.trackInventory : ['product', 'bundle'].includes(body.itemType ?? 'product'),
          body.status ?? null,
        ],
      )

      return reply.code(201).send({ product: toApiShape(product) })
    },
  )

  fastify.patch(
    '/api/products/:id',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = patchBody.parse(request.body)

      // Fetch the product first to calculate available stock if stock/reserved updates
      const { rows: [existing] } = await db.query(
        'SELECT stock, reserved FROM products WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Product not found' })

      const sets: string[] = ['updated_at = NOW()']
      const values: unknown[] = [id, userId]
      let idx = 3

      // Stock backward compatibility
      let newStock = existing.stock
      let newReserved = existing.reserved

      if (body.name !== undefined) { sets.push(`name = $${idx++}`); values.push(body.name) }
      if (body.description !== undefined) { sets.push(`description = $${idx++}`); values.push(body.description) }
      
      // Handle price / sellingPrice mapping
      if (body.sellingPrice !== undefined || body.price !== undefined) {
        const finalPrice = body.sellingPrice !== undefined ? body.sellingPrice : body.price
        sets.push(`price = $${idx++}`); values.push(finalPrice)
        sets.push(`selling_price = $${idx++}`); values.push(finalPrice)
      }
      
      if (body.currency !== undefined) { sets.push(`currency = $${idx++}`); values.push(body.currency) }
      if (body.serialNumber !== undefined) { sets.push(`serial_number = $${idx++}`); values.push(body.serialNumber) }
      
      // Handle stock / quantity mapping
      if (body.stock !== undefined || body.quantity !== undefined) {
        const finalStock = body.stock !== undefined ? body.stock : body.quantity
        newStock = finalStock ?? 0
        sets.push(`quantity = $${idx++}`); values.push(finalStock)
        sets.push(`stock = $${idx++}`); values.push(finalStock)
      }
      
      if (body.images !== undefined) { sets.push(`images = $${idx++}::jsonb`); values.push(JSON.stringify(body.images)) }
      if (body.status !== undefined) { sets.push(`status = $${idx++}`); values.push(body.status) }

      // New columns
      if (body.sku !== undefined) { sets.push(`sku = $${idx++}`); values.push(body.sku) }
      if (body.barcode !== undefined) { sets.push(`barcode = $${idx++}`); values.push(body.barcode) }
      if (body.category !== undefined) { sets.push(`category = $${idx++}`); values.push(body.category) }
      if (body.supplierId !== undefined) { sets.push(`supplier_id = $${idx++}`); values.push(body.supplierId) }
      if (body.brand !== undefined) { sets.push(`brand = $${idx++}`); values.push(body.brand) }
      if (body.itemType !== undefined) { sets.push(`item_type = $${idx++}`); values.push(body.itemType) }
      if (body.videos !== undefined) { sets.push(`videos = $${idx++}::jsonb`); values.push(JSON.stringify(body.videos)) }
      
      if (body.reserved !== undefined) {
        newReserved = body.reserved ?? 0
        sets.push(`reserved = $${idx++}`); values.push(body.reserved)
      }
      
      // Automatically update available
      sets.push(`available = $${idx++}`); values.push(newStock - newReserved)

      if (body.minimumStock !== undefined) { sets.push(`minimum_stock = $${idx++}`); values.push(body.minimumStock) }
      if (body.maximumStock !== undefined) { sets.push(`maximum_stock = $${idx++}`); values.push(body.maximumStock) }
      if (body.leadTime !== undefined) { sets.push(`lead_time = $${idx++}`); values.push(body.leadTime) }
      if (body.supplierLeadTime !== undefined) { sets.push(`supplier_lead_time = $${idx++}`); values.push(body.supplierLeadTime) }
      if (body.purchaseCost !== undefined) { sets.push(`purchase_cost = $${idx++}`); values.push(body.purchaseCost) }
      if (body.margin !== undefined) { sets.push(`margin = $${idx++}`); values.push(body.margin) }
      if (body.discountRules !== undefined) { sets.push(`discount_rules = $${idx++}::jsonb`); values.push(JSON.stringify(body.discountRules)) }
      if (body.crossSell !== undefined) { sets.push(`cross_sell = $${idx++}::jsonb`); values.push(JSON.stringify(body.crossSell)) }
      if (body.upsell !== undefined) { sets.push(`upsell = $${idx++}::jsonb`); values.push(JSON.stringify(body.upsell)) }
      if (body.replacementProductId !== undefined) { sets.push(`replacement_product_id = $${idx++}`); values.push(body.replacementProductId) }
      if (body.relatedProducts !== undefined) { sets.push(`related_products = $${idx++}::jsonb`); values.push(JSON.stringify(body.relatedProducts)) }
      if (body.warranty !== undefined) { sets.push(`warranty = $${idx++}`); values.push(body.warranty) }
      if (body.manual !== undefined) { sets.push(`manual = $${idx++}`); values.push(body.manual) }
      if (body.tags !== undefined) { sets.push(`tags = $${idx++}::text[]`); values.push(body.tags) }
      if (body.serviceDetails !== undefined) { sets.push(`service_details = $${idx++}::jsonb`); values.push(JSON.stringify(body.serviceDetails)) }
      if (body.inventoryDetails !== undefined) { sets.push(`inventory_details = $${idx++}::jsonb`); values.push(JSON.stringify(body.inventoryDetails)) }
      if (body.pricingDetails !== undefined) { sets.push(`pricing_details = $${idx++}::jsonb`); values.push(JSON.stringify(body.pricingDetails)) }
      if (body.aiNotes !== undefined) { sets.push(`ai_notes = $${idx++}`); values.push(body.aiNotes) }
      if (body.marketingCopy !== undefined) { sets.push(`marketing_copy = $${idx++}`); values.push(body.marketingCopy) }
      if (body.minPrice !== undefined) { sets.push(`min_price = $${idx++}`); values.push(body.minPrice) }
      if (body.maxPrice !== undefined) { sets.push(`max_price = $${idx++}`); values.push(body.maxPrice) }
      if (body.discountMinPct !== undefined) { sets.push(`discount_min_pct = $${idx++}`); values.push(body.discountMinPct) }
      if (body.discountMaxPct !== undefined) { sets.push(`discount_max_pct = $${idx++}`); values.push(body.discountMaxPct) }
      if (body.familyId !== undefined) { sets.push(`family_id = $${idx++}`); values.push(body.familyId) }
      if (body.attributes !== undefined) { sets.push(`attributes = $${idx++}::jsonb`); values.push(JSON.stringify(body.attributes)) }
      if (body.pricingModel !== undefined) { sets.push(`pricing_model = $${idx++}`); values.push(body.pricingModel) }
      if (body.trackInventory !== undefined) { sets.push(`track_inventory = $${idx++}`); values.push(body.trackInventory) }
      // itemType changing without an explicit trackInventory override should
      // re-derive the sensible default (a service switched from 'product'
      // shouldn't keep tracking stock, and vice versa).
      if (body.itemType !== undefined && body.trackInventory === undefined) {
        sets.push(`track_inventory = $${idx++}`); values.push(['product', 'bundle'].includes(body.itemType))
      }

      const { rowCount } = await db.query(
        `UPDATE products SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
        values,
      )
      if (!rowCount) return reply.code(404).send({ error: 'Product not found' })

      return reply.send({ ok: true })
    },
  )

  // ── Stock movements — typed, reasoned inventory adjustments (see CLAUDE.md
  // "Studio ERP") replacing the blind PATCH {stock: N} overwrite above with
  // an auditable restock/sale/adjustment/waste/return trail. Business OS
  // Phase C (docs/BUSINESS_OS_PLAN.md §7) adds location-awareness: every
  // movement is scoped to a location (defaulting to the user's single "Main"
  // location so single-location businesses see no change), and `transfer`
  // moves stock between two locations without changing the product's
  // aggregate stock/available. ──────────────

  // 'committed' and 'in_transit' exist in the DB enum (see migrations
  // 0057/0058) but aren't accepted here — they change `reserved`/`incoming`
  // semantics that this endpoint doesn't model yet (committed) or are
  // system-generated by the purchase-order workflow (in_transit), not a
  // manual stock adjustment.
  const stockMovementBody = z.object({
    movementType: z.enum(['restock', 'sale', 'adjustment', 'waste', 'return', 'expired', 'transfer']),
    quantityDelta: z.number().int().refine(n => n !== 0, 'quantityDelta must not be zero'),
    reason: z.string().max(500).optional().nullable(),
    locationId: z.string().uuid().optional(),
    toLocationId: z.string().uuid().optional(),
  })

  async function resolveLocationId(userId: string, locationId?: string): Promise<string | null> {
    if (locationId) {
      const { rows: [owned] } = await db.query(
        'SELECT id FROM inventory_locations WHERE id = $1 AND user_id = $2',
        [locationId, userId],
      )
      return owned ? owned.id : null
    }
    const { rows: [loc] } = await db.query(
      'SELECT id FROM inventory_locations WHERE user_id = $1 AND is_default = true',
      [userId],
    )
    if (loc) return loc.id
    const { rows: [created] } = await db.query(
      `INSERT INTO inventory_locations (user_id, name, is_default) VALUES ($1, 'Main', true) RETURNING id`,
      [userId],
    )
    return created.id
  }

  async function getOrCreateStockByLocation(productId: string, locationId: string) {
    const { rows: [row] } = await db.query(
      `INSERT INTO product_stock_by_location (product_id, location_id, stock, reserved)
       VALUES ($1, $2, 0, 0)
       ON CONFLICT (product_id, location_id) DO UPDATE SET updated_at = product_stock_by_location.updated_at
       RETURNING *`,
      [productId, locationId],
    )
    return row
  }

  fastify.post(
    '/api/products/:id/stock-movements',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = stockMovementBody.parse(request.body)

      const { rows: [existing] } = await db.query(
        'SELECT stock, reserved, available FROM products WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!existing) return reply.code(404).send({ error: 'Product not found' })

      const locationId = await resolveLocationId(userId, body.locationId)
      if (!locationId) return reply.code(404).send({ error: 'Location not found' })

      if (body.movementType === 'transfer') {
        if (!body.toLocationId) return reply.code(400).send({ error: 'toLocationId is required for a transfer' })
        if (body.toLocationId === locationId) return reply.code(400).send({ error: 'Source and destination locations must differ' })

        const { rows: [names] } = await db.query(
          `SELECT (SELECT name FROM inventory_locations WHERE id = $1 AND user_id = $3) AS from_name,
                  (SELECT name FROM inventory_locations WHERE id = $2 AND user_id = $3) AS to_name`,
          [locationId, body.toLocationId, userId],
        )
        if (!names.from_name || !names.to_name) return reply.code(404).send({ error: 'Location not found' })

        const qty = Math.abs(body.quantityDelta)
        const fromRow = await getOrCreateStockByLocation(id, locationId)
        const toRow = await getOrCreateStockByLocation(id, body.toLocationId)
        const newFromStock = Math.max(0, fromRow.stock - qty)
        const newToStock = toRow.stock + qty

        await db.query('UPDATE product_stock_by_location SET stock = $1, updated_at = NOW() WHERE product_id = $2 AND location_id = $3', [newFromStock, id, locationId])
        await db.query('UPDATE product_stock_by_location SET stock = $1, updated_at = NOW() WHERE product_id = $2 AND location_id = $3', [newToStock, id, body.toLocationId])

        const reasonSuffix = body.reason ? ` — ${body.reason}` : ''
        const { rows: [outMovement] } = await db.query(
          `INSERT INTO stock_movements (user_id, product_id, movement_type, quantity_delta, previous_stock, new_stock, reason, location_id)
           VALUES ($1, $2, 'transfer', $3, $4, $5, $6, $7)
           RETURNING id, movement_type, quantity_delta, previous_stock, new_stock, reason, created_at, location_id`,
          [userId, id, -qty, fromRow.stock, newFromStock, `Transfer to ${names.to_name}${reasonSuffix}`, locationId],
        )
        const { rows: [inMovement] } = await db.query(
          `INSERT INTO stock_movements (user_id, product_id, movement_type, quantity_delta, previous_stock, new_stock, reason, location_id)
           VALUES ($1, $2, 'transfer', $3, $4, $5, $6, $7)
           RETURNING id, movement_type, quantity_delta, previous_stock, new_stock, reason, created_at, location_id`,
          [userId, id, qty, toRow.stock, newToStock, `Transfer from ${names.from_name}${reasonSuffix}`, body.toLocationId],
        )

        // A transfer redistributes stock between locations — the product's
        // aggregate stock/available is unchanged.
        return reply.code(201).send({
          movements: [outMovement, inMovement].map(m => ({
            id: m.id, movementType: m.movement_type, quantityDelta: m.quantity_delta,
            previousStock: m.previous_stock, newStock: m.new_stock, reason: m.reason,
            createdAt: m.created_at, locationId: m.location_id,
          })),
          stock: existing.stock,
          available: existing.available,
        })
      }

      const locRow = await getOrCreateStockByLocation(id, locationId)
      const newLocStock = Math.max(0, locRow.stock + body.quantityDelta)
      await db.query(
        'UPDATE product_stock_by_location SET stock = $1, updated_at = NOW() WHERE product_id = $2 AND location_id = $3',
        [newLocStock, id, locationId],
      )

      const previousStock = existing.stock
      const newStock = Math.max(0, previousStock + body.quantityDelta)
      const newAvailable = Math.max(0, newStock - existing.reserved)

      const { rows: [movement] } = await db.query(
        `INSERT INTO stock_movements
           (user_id, product_id, movement_type, quantity_delta, previous_stock, new_stock, reason, location_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, movement_type, quantity_delta, previous_stock, new_stock, reason, created_at, location_id`,
        [userId, id, body.movementType, body.quantityDelta, previousStock, newStock, body.reason ?? null, locationId],
      )

      await db.query(
        `UPDATE products SET stock = $1, quantity = $1, available = $2, updated_at = NOW()
         WHERE id = $3 AND user_id = $4`,
        [newStock, newAvailable, id, userId],
      )

      return reply.code(201).send({
        movement: {
          id: movement.id,
          movementType: movement.movement_type,
          quantityDelta: movement.quantity_delta,
          previousStock: movement.previous_stock,
          newStock: movement.new_stock,
          reason: movement.reason,
          createdAt: movement.created_at,
          locationId: movement.location_id,
        },
        stock: newStock,
        available: newAvailable,
      })
    },
  )

  fastify.get(
    '/api/products/:id/stock-movements',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows } = await db.query(
        `SELECT sm.id, sm.movement_type, sm.quantity_delta, sm.previous_stock, sm.new_stock,
                sm.reason, sm.created_at, sm.location_id, il.name AS location_name
         FROM stock_movements sm
         LEFT JOIN inventory_locations il ON il.id = sm.location_id
         WHERE sm.user_id = $1 AND sm.product_id = $2
         ORDER BY sm.created_at DESC LIMIT 50`,
        [userId, id],
      )

      return reply.send({
        movements: rows.map((m: any) => ({
          id: m.id,
          movementType: m.movement_type,
          quantityDelta: m.quantity_delta,
          previousStock: m.previous_stock,
          newStock: m.new_stock,
          reason: m.reason,
          createdAt: m.created_at,
          locationId: m.location_id,
          locationName: m.location_name,
        })),
      })
    },
  )

  fastify.get(
    '/api/products/:id/contacts',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const { rows } = await db.query(
        `SELECT cp.id, cp.contact_id, cp.relation_type, cp.quantity, cp.created_at,
                COALESCE(co.custom_name, co.display_name, co.phone_number, co.whatsapp_jid) AS contact_name,
                co.avatar_url, co.phone_number, co.customer_status, co.pipeline_stage, co.lead_score
         FROM contact_products cp
         JOIN contacts co ON co.id = cp.contact_id AND co.user_id = cp.user_id
         WHERE cp.user_id = $1 AND cp.product_id = $2
         ORDER BY cp.updated_at DESC`,
        [userId, id],
      )

      return reply.send({
        contacts: rows.map((r: any) => ({
          id: r.id,
          contactId: r.contact_id,
          contactName: r.contact_name,
          avatarUrl: r.avatar_url,
          phone: r.phone_number,
          customerStatus: r.customer_status,
          pipelineStage: r.pipeline_stage,
          leadScore: r.lead_score,
          relationType: r.relation_type,
          quantity: r.quantity,
          createdAt: r.created_at,
        })),
      })
    },
  )

  // ── GET /api/products/:id/co-purchases — "customers who bought this also
  // bought..." derived from real contact_products purchase history (Business
  // OS Phase D, docs/BUSINESS_OS_PLAN.md §9). Distinct from the
  // manually-curated products.cross_sell/upsell JSONB — this is computed
  // from what customers have actually bought together. Reimplemented on the
  // Knowledge Graph query layer (Neural Layer Phase 4, ../lib/knowledge-graph)
  // instead of a bespoke join, so this endpoint no longer needs to know
  // contact_products is the underlying join table. ──
  fastify.get(
    '/api/products/:id/co-purchases',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }

      const neighbors = await coPurchasers(userId, id, 5)
      if (neighbors.length === 0) return reply.send({ coPurchases: [] })

      const { rows: names } = await db.query(
        `SELECT id, name FROM products WHERE user_id = $1 AND id = ANY($2::uuid[])`,
        [userId, neighbors.map(n => n.entityId)],
      )
      const nameById = new Map(names.map((r: any) => [r.id, r.name]))

      return reply.send({
        coPurchases: neighbors.map(n => ({
          productId: n.entityId,
          productName: nameById.get(n.entityId) ?? null,
          confidencePct: Math.round(n.weight * 100),
        })),
      })
    },
  )

  // ── POST /api/products/:id/reserve — commit stock against a pending
  // order/quotation without physically changing on-hand stock (Business OS
  // Phase E, docs/BUSINESS_OS_PLAN.md §15, closing the gap Phase C
  // deliberately left open: `committed` exists in the stock_movements enum
  // but nothing wired it to `products.reserved` until now). Increments
  // `reserved` (so `available` drops) and logs a `committed` movement whose
  // previous_stock/new_stock are equal — signalling "this changed what's
  // spoken for, not what's physically on hand." ──
  const reserveBody = z.object({
    quantity: z.number().int().positive(),
    reason: z.string().max(500).optional().nullable(),
  })

  fastify.post(
    '/api/products/:id/reserve',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = reserveBody.parse(request.body)

      const result = await reserveStock(userId, id, body.quantity, body.reason)
      if (!result) return reply.code(404).send({ error: 'Product not found' })

      return reply.code(201).send(result)
    },
  )

  fastify.post(
    '/api/products/:id/contacts',
    { preHandler: [authenticate, requireMarketingAccess, requireFeature('business_os')] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }
      const { id } = request.params as { id: string }
      const body = linkContactBody.parse(request.body)

      const { rows: [product] } = await db.query<{ id: string }>(
        'SELECT id FROM products WHERE id = $1 AND user_id = $2 AND status != $3',
        [id, userId, 'archived'],
      )
      if (!product) return reply.code(404).send({ error: 'Product not found' })

      const { rows: [contact] } = await db.query<{ id: string }>(
        'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
        [body.contactId, userId],
      )
      if (!contact) return reply.code(404).send({ error: 'Contact not found' })

      await db.query(
        `INSERT INTO contact_products (user_id, contact_id, product_id, relation_type, quantity)
         VALUES ($1, $2, $3, $4, COALESCE($5, 1))
         ON CONFLICT (user_id, contact_id, product_id) DO UPDATE SET
           relation_type = EXCLUDED.relation_type,
           quantity = EXCLUDED.quantity,
           updated_at = NOW()`,
        [userId, body.contactId, id, body.relationType, body.quantity ?? null],
      )

      if (['interested', 'quoted', 'purchased'].includes(body.relationType)) {
        await db.query(
          `UPDATE contacts
           SET source_product_id = COALESCE(source_product_id, $1), updated_at = NOW()
           WHERE id = $2 AND user_id = $3`,
          [id, body.contactId, userId],
        )
      }

      return reply.code(201).send({ ok: true })
    },
  )
}
