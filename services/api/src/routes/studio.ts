import type { FastifyInstance } from 'fastify'
import { db } from '../lib/db'
import { authenticate } from '../plugins/authenticate'
import { requireMarketingAccess } from '../lib/marketing-access'

// Deterministic, SQL-driven business insights for the Studio ERP tabs — see
// CLAUDE.md "Studio ERP". Rule-based rather than LLM-generated: exact
// thresholds are more trustworthy than a narrative for inventory/margin data,
// and the AI Business Advisor chat is where a user asks for narrative framing.
export async function studioRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/studio/insights',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const [statsResult, lowStockResult, thinMarginResult, supplierFlagsResult, suggestedPORows] = await Promise.all([
        db.query(
          `SELECT
             (SELECT COUNT(*) FROM products WHERE user_id = $1) AS total_products,
             (SELECT COALESCE(SUM(available * purchase_cost), 0) FROM products WHERE user_id = $1) AS inventory_value,
             (SELECT COUNT(*) FROM products WHERE user_id = $1 AND available <= minimum_stock AND available > 0) AS low_stock_count,
             (SELECT COUNT(*) FROM products WHERE user_id = $1 AND available = 0) AS out_of_stock_count,
             (SELECT COUNT(*) FROM suppliers WHERE user_id = $1) AS total_suppliers,
             (SELECT COALESCE(SUM(outstanding_balance), 0) FROM suppliers WHERE user_id = $1) AS outstanding_supplier_balance,
             (SELECT COUNT(*) FROM business_facts WHERE user_id = $1 AND category = 'business_rule' AND is_active = true) AS active_rules`,
          [userId],
        ),
        db.query(
          `SELECT id, name, available, minimum_stock
           FROM products WHERE user_id = $1 AND available <= minimum_stock
           ORDER BY available ASC LIMIT 10`,
          [userId],
        ),
        db.query(
          `SELECT id, name, selling_price, purchase_cost,
                  ROUND(((selling_price - purchase_cost) / NULLIF(selling_price, 0)) * 100, 1) AS margin_pct
           FROM products
           WHERE user_id = $1 AND selling_price IS NOT NULL AND selling_price > 0 AND purchase_cost > 0
             AND ((selling_price - purchase_cost) / selling_price) * 100 < 15
           ORDER BY margin_pct ASC LIMIT 10`,
          [userId],
        ),
        db.query(
          `SELECT id, company, reliability_score, average_delivery_time
           FROM suppliers
           WHERE user_id = $1 AND (reliability_score < 80 OR average_delivery_time > 14)
           ORDER BY reliability_score ASC LIMIT 10`,
          [userId],
        ),
        // Business OS Phase B (§8.3) — for each low/out-of-stock product,
        // find its cheapest linked supplier and propose a one-tap reorder.
        // Products already in incoming aren't suppressed here — the UI can
        // decide whether "already on order" should hide the suggestion.
        db.query(
          `SELECT DISTINCT ON (p.id)
                  p.id AS product_id, p.name AS product_name, p.available, p.minimum_stock,
                  p.maximum_stock, p.incoming,
                  sp.supplier_id, s.company AS supplier_name, sp.cost, sp.lead_time_days, sp.minimum_qty
           FROM products p
           JOIN supplier_products sp ON sp.product_id = p.id
           JOIN suppliers s ON s.id = sp.supplier_id AND s.user_id = p.user_id
           WHERE p.user_id = $1 AND p.available <= p.minimum_stock AND p.parent_product_id IS NULL
           ORDER BY p.id, sp.cost ASC NULLS LAST
           LIMIT 10`,
          [userId],
        ),
      ])

      const s = statsResult.rows[0]

      return reply.send({
        stats: {
          totalProducts: parseInt(s.total_products, 10),
          inventoryValue: parseFloat(s.inventory_value),
          lowStockCount: parseInt(s.low_stock_count, 10),
          outOfStockCount: parseInt(s.out_of_stock_count, 10),
          totalSuppliers: parseInt(s.total_suppliers, 10),
          outstandingSupplierBalance: parseFloat(s.outstanding_supplier_balance),
          activeRules: parseInt(s.active_rules, 10),
        },
        lowStock: lowStockResult.rows.map((r: any) => ({
          id: r.id, name: r.name, available: r.available, minimumStock: r.minimum_stock,
        })),
        thinMargin: thinMarginResult.rows.map((r: any) => ({
          id: r.id, name: r.name,
          sellingPrice: parseFloat(r.selling_price), purchaseCost: parseFloat(r.purchase_cost),
          marginPct: parseFloat(r.margin_pct),
        })),
        supplierFlags: supplierFlagsResult.rows.map((r: any) => ({
          id: r.id, company: r.company,
          reliabilityScore: r.reliability_score, averageDeliveryTime: r.average_delivery_time,
          flag: r.reliability_score < 80 ? 'low_reliability' : 'slow_delivery',
        })),
        suggestedPurchaseOrders: suggestedPORows.rows.map((r: any) => {
          // Reorder up to the configured ceiling if set, else double the
          // reorder point — then respect the supplier's minimum order qty.
          const target = r.maximum_stock ?? r.minimum_stock * 2
          const baseQty = Math.max(target - r.available - r.incoming, 1)
          const quantity = r.minimum_qty ? Math.max(baseQty, r.minimum_qty) : baseQty
          return {
            productId: r.product_id,
            productName: r.product_name,
            available: r.available,
            minimumStock: r.minimum_stock,
            incoming: r.incoming,
            supplierId: r.supplier_id,
            supplierName: r.supplier_name,
            unitCost: r.cost != null ? parseFloat(r.cost) : null,
            leadTimeDays: r.lead_time_days,
            quantity,
            estimatedCost: r.cost != null ? parseFloat(r.cost) * quantity : null,
          }
        }),
      })
    },
  )
}
