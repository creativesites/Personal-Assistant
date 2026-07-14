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

      const [statsResult, lowStockResult, thinMarginResult, supplierFlagsResult] = await Promise.all([
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
      })
    },
  )
}
