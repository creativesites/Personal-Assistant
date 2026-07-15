import { db } from './db'

// Zuri Neural Layer Phase 4 — Knowledge Graph Query Layer (see
// docs/NEURAL_LAYER_PLAN.md §4.5/§10). A named traversal contract over
// relationships that already exist as foreign keys (contact_products,
// supplier_products, etc.) plus the smaller knowledge_graph_edges table
// for AI-inferred edges no FK expresses. This does not replace those FK
// tables — it's a query layer over them, so a caller stops needing to
// know which specific join table to hit for a given entity pair.
//
// First consumer: GET /api/products/:id/co-purchases (Business OS Phase D)
// — reimplemented below as coPurchasers() instead of a bespoke query,
// proving the abstraction pulls its weight before other modules adopt it.
// services/intelligence/app/neural/knowledge_graph.py is the Python-side
// equivalent for services/intelligence's own consumers (e.g. reply_gen's
// catalog context) — both implementations share the same contract shape
// and both read/write the same knowledge_graph_edges table, since the two
// services have independent DB pools and neither calls the other's code.

export type EntityType = 'contact' | 'product' | 'supplier' | 'project' | 'deal' | 'document'

export interface GraphNeighbor {
  entityType: EntityType
  entityId: string
  relationType: string
  weight: number
  source: 'structural' | 'inferred'
}

// Structural edge: "products co-purchased by the same contacts who bought
// this product" — derived from contact_products, not backfilled into
// knowledge_graph_edges since it's already fully expressed by that table.
export async function coPurchasers(userId: string, productId: string, limit = 5): Promise<GraphNeighbor[]> {
  const { rows } = await db.query(
    `WITH base_purchasers AS (
       SELECT DISTINCT contact_id FROM contact_products
       WHERE user_id = $1 AND product_id = $2 AND relation_type = 'purchased'
     )
     SELECT p.id AS product_id,
            COUNT(DISTINCT cp.contact_id) AS co_count,
            (SELECT COUNT(*) FROM base_purchasers) AS base_count
     FROM contact_products cp
     JOIN base_purchasers bp ON bp.contact_id = cp.contact_id
     JOIN products p ON p.id = cp.product_id AND p.user_id = $1
     WHERE cp.user_id = $1 AND cp.relation_type = 'purchased' AND cp.product_id != $2
     GROUP BY p.id
     ORDER BY co_count DESC
     LIMIT $3`,
    [userId, productId, limit],
  )

  return rows.map((r: any) => ({
    entityType: 'product' as const,
    entityId: r.product_id,
    relationType: 'often_bought_with',
    weight: Number(r.base_count) > 0 ? Number(r.co_count) / Number(r.base_count) : 0,
    source: 'structural' as const,
  }))
}

// Inferred edges only — the smaller knowledge_graph_edges table. No
// structural union here yet since the only current consumer (co-purchases)
// is fully expressed by contact_products; add unions here as more entity
// pairs need traversal (deals<->projects via deal_id, goal_linked_entities, etc.).
export async function inferredNeighbors(
  userId: string,
  fromEntityType: EntityType,
  fromEntityId: string,
  limit = 5,
): Promise<GraphNeighbor[]> {
  const { rows } = await db.query(
    `SELECT to_entity_type, to_entity_id, relation_type, confidence
     FROM knowledge_graph_edges
     WHERE user_id = $1 AND from_entity_type = $2 AND from_entity_id = $3
     ORDER BY confidence DESC
     LIMIT $4`,
    [userId, fromEntityType, fromEntityId, limit],
  )

  return rows.map((r: any) => ({
    entityType: r.to_entity_type,
    entityId: r.to_entity_id,
    relationType: r.relation_type,
    weight: Number(r.confidence),
    source: 'inferred' as const,
  }))
}
