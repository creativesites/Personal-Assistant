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

      const [statsResult, lowStockResult, thinMarginResult, supplierFlagsResult, suggestedPORows,
        topProfitableResult, topVelocityResult, avgOrderSizeResult, stockoutForecastResult] = await Promise.all([
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
        // Business OS Phase D (§9) — sales intelligence, all derived from
        // real stock_movements/contact_products history rather than
        // narrative/LLM output, same "deterministic insights" convention.
        db.query(
          `SELECT p.id, p.name, p.selling_price, p.purchase_cost,
                  COALESCE(SUM(-sm.quantity_delta), 0) AS units_sold,
                  COALESCE(SUM(-sm.quantity_delta), 0) * (p.selling_price - p.purchase_cost) AS total_profit
           FROM products p
           JOIN stock_movements sm ON sm.product_id = p.id AND sm.movement_type = 'sale' AND sm.user_id = p.user_id
           WHERE p.user_id = $1 AND p.selling_price IS NOT NULL AND p.purchase_cost IS NOT NULL
           GROUP BY p.id, p.name, p.selling_price, p.purchase_cost
           HAVING COALESCE(SUM(-sm.quantity_delta), 0) > 0
           ORDER BY total_profit DESC LIMIT 5`,
          [userId],
        ),
        db.query(
          `SELECT p.id, p.name, COALESCE(SUM(-sm.quantity_delta), 0) AS units_sold_30d
           FROM products p
           JOIN stock_movements sm ON sm.product_id = p.id AND sm.movement_type = 'sale' AND sm.user_id = p.user_id
             AND sm.created_at >= NOW() - INTERVAL '30 days'
           WHERE p.user_id = $1
           GROUP BY p.id, p.name
           ORDER BY units_sold_30d DESC LIMIT 5`,
          [userId],
        ),
        db.query(
          `SELECT COALESCE(AVG(quantity), 0) AS avg_order_size
           FROM contact_products
           WHERE user_id = $1 AND relation_type = 'purchased' AND quantity IS NOT NULL`,
          [userId],
        ),
        // Business OS Phase G (§7.3) — read the intelligence service's
        // precomputed forecasts rather than a raw low-stock threshold, since
        // "will stock out this week" needs sales velocity, not just a static
        // minimum_stock comparison.
        db.query(
          `SELECT f.product_id, p.name AS product_name, f.expected_stockout_date,
                  f.recommended_order_qty, f.recommended_order_date, f.cash_required
           FROM inventory_forecasts f
           JOIN products p ON p.id = f.product_id AND p.user_id = $1
           WHERE f.expected_stockout_date IS NOT NULL AND f.expected_stockout_date <= CURRENT_DATE + INTERVAL '14 days'
           ORDER BY f.expected_stockout_date ASC LIMIT 10`,
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
        topProfitable: topProfitableResult.rows.map((r: any) => ({
          id: r.id, name: r.name, unitsSold: Number(r.units_sold), totalProfit: parseFloat(r.total_profit),
        })),
        topVelocity: topVelocityResult.rows.map((r: any) => ({
          id: r.id, name: r.name, unitsSold30d: Number(r.units_sold_30d),
        })),
        avgOrderSize: parseFloat(avgOrderSizeResult.rows[0].avg_order_size),
        stockoutForecasts: stockoutForecastResult.rows.map((r: any) => ({
          productId: r.product_id,
          productName: r.product_name,
          expectedStockoutDate: r.expected_stockout_date,
          recommendedOrderQty: r.recommended_order_qty,
          recommendedOrderDate: r.recommended_order_date,
          cashRequired: r.cash_required != null ? parseFloat(r.cash_required) : null,
        })),
      })
    },
  )

  // Business OS Phase G (§13) — Operational Financial Overview. Explicitly
  // *not* accounting: no ledger, no double-entry, no chart of accounts —
  // a rollup over data that already exists (documents, products, stock
  // movements). Expenses are the one genuinely missing input; per the
  // plan's own recommendation this reuses the already-defined-but-unbuilt
  // `expense_claim` document type rather than a parallel ledger table, so
  // it's surfaced as a note rather than a hard number until that exists.
  fastify.get(
    '/api/studio/financial-overview',
    { preHandler: [authenticate, requireMarketingAccess] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string }

      const [invoiceTotalsResult, purchasesResult, marginResult, expenseClaimsResult] = await Promise.all([
        db.query(
          `SELECT
             COALESCE(SUM(total_cents) FILTER (WHERE status = 'paid'), 0) AS cash_collected_cents,
             COALESCE(SUM(total_cents) FILTER (WHERE status IN ('sent', 'viewed', 'downloaded')), 0) AS outstanding_cents
           FROM documents
           WHERE user_id = $1 AND document_type = 'invoice'`,
          [userId],
        ),
        db.query(
          `SELECT
             COALESCE(SUM(sm.quantity_delta * p.purchase_cost), 0) AS purchases_all_time,
             COALESCE(SUM(sm.quantity_delta * p.purchase_cost) FILTER (WHERE sm.created_at >= NOW() - INTERVAL '30 days'), 0) AS purchases_30d
           FROM stock_movements sm
           JOIN products p ON p.id = sm.product_id
           WHERE sm.user_id = $1 AND sm.movement_type = 'restock'`,
          [userId],
        ),
        db.query(
          `SELECT
             COALESCE(SUM(available * purchase_cost), 0) AS inventory_value,
             COALESCE(AVG(margin) FILTER (WHERE margin IS NOT NULL), 0) AS avg_margin_pct
           FROM products WHERE user_id = $1`,
          [userId],
        ),
        db.query(
          `SELECT COUNT(*) AS count, COALESCE(SUM(total_cents), 0) AS total_cents
           FROM documents WHERE user_id = $1 AND document_type = 'expense_claim'`,
          [userId],
        ),
      ])

      const invoiceTotals = invoiceTotalsResult.rows[0]
      const purchases = purchasesResult.rows[0]
      const margin = marginResult.rows[0]
      const expenseClaims = expenseClaimsResult.rows[0]

      const cashCollectedCents = parseInt(invoiceTotals.cash_collected_cents, 10)
      const outstandingCents = parseInt(invoiceTotals.outstanding_cents, 10)

      return reply.send({
        revenue: {
          cashCollectedCents,
          outstandingCents,
          totalInvoicedCents: cashCollectedCents + outstandingCents,
        },
        purchases: {
          allTimeCents: Math.round(parseFloat(purchases.purchases_all_time) * 100),
          last30DaysCents: Math.round(parseFloat(purchases.purchases_30d) * 100),
        },
        inventoryValueCents: Math.round(parseFloat(margin.inventory_value) * 100),
        avgMarginPct: parseFloat(margin.avg_margin_pct),
        expenses: {
          // Deferred per plan §13 — recommend the expense_claim document
          // type over a parallel ledger table. Zero counts just mean the
          // feature hasn't been used yet, not that expenses are actually 0.
          claimCount: parseInt(expenseClaims.count, 10),
          totalCents: parseInt(expenseClaims.total_cents, 10),
          note: 'Track expenses by generating an "expense_claim" document — a dedicated expense ledger is not yet built.',
        },
      })
    },
  )
}
