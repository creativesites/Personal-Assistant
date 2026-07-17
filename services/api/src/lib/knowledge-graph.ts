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

// Career & Growth Engine Phase 6 — Relationship-to-Opportunity Bridge (see
// docs/CAREER_GROWTH_ENGINE_PLAN.md §7). career_opportunity -> contact is a
// knowledge_graph_edges entry (relation_type 'hiring_manager_for'/
// 'recruiter_for', written wherever a hiring contact gets identified — no
// writer exists yet, so this reads whatever's there and falls back to
// career_opportunities.contact_id when set directly) combined with the
// existing relationship_connections people-graph (works_with, colleague_at,
// etc.) — enough to answer "who do I actually know who's closest to this
// opportunity?" without any new schema.
export type IntroductionPathHop = {
  contactId: string
  contactName: string
  // The relationship_connections connection_type linking this hop to the
  // NEXT one in the chain (toward the target); null on the target itself.
  connectionType: string | null
}

export type IntroductionPathResult = {
  targetContactId: string
  targetContactName: string
  // Ordered from the nearest contact the user actually has message history
  // with, through intermediaries, to the target. Empty if no path was
  // found within the bounded search — a cold outreach is the only option.
  path: IntroductionPathHop[]
  // True when the target itself is already someone the user has message
  // history with — no introduction needed, just reach out directly.
  isDirect: boolean
}

const _INTRODUCTION_MAX_DEPTH = 3

export async function shortestIntroductionPath(
  userId: string, careerOpportunityId: string,
): Promise<IntroductionPathResult | null> {
  const { rows: [edge] } = await db.query(
    `SELECT to_entity_id FROM knowledge_graph_edges
     WHERE user_id = $1 AND from_entity_type = 'career_opportunity' AND from_entity_id = $2
       AND to_entity_type = 'contact' AND relation_type IN ('hiring_manager_for', 'recruiter_for')
     ORDER BY confidence DESC LIMIT 1`,
    [userId, careerOpportunityId],
  )
  let targetContactId: string | undefined = edge?.to_entity_id
  if (!targetContactId) {
    const { rows: [opp] } = await db.query(
      'SELECT contact_id FROM career_opportunities WHERE id = $1 AND user_id = $2',
      [careerOpportunityId, userId],
    )
    targetContactId = opp?.contact_id ?? undefined
  }
  if (!targetContactId) return null

  const { rows: [target] } = await db.query(
    `SELECT co.id, COALESCE(co.custom_name, co.display_name, co.phone_number) AS name, r.last_interaction_at
     FROM contacts co LEFT JOIN relationships r ON r.contact_id = co.id AND r.user_id = $1
     WHERE co.id = $2 AND co.user_id = $1`,
    [userId, targetContactId],
  )
  if (!target) return null

  if (target.last_interaction_at) {
    return {
      targetContactId, targetContactName: target.name,
      path: [{ contactId: targetContactId, contactName: target.name, connectionType: null }],
      isDirect: true,
    }
  }

  // Bounded BFS outward from the target through relationship_connections
  // (bidirectional — contact_a/contact_b carry no inherent direction),
  // stopping at the shallowest depth that reaches a contact the user
  // actually has message history with (relationships.last_interaction_at).
  const visited = new Set<string>([targetContactId])
  const parent = new Map<string, { from: string; connectionType: string }>()
  let frontier = [targetContactId]

  for (let depth = 0; depth < _INTRODUCTION_MAX_DEPTH && frontier.length > 0; depth++) {
    const { rows: edges } = await db.query(
      `SELECT contact_a_id AS from_id, contact_b_id AS to_id, connection_type FROM relationship_connections
         WHERE user_id = $1 AND is_active = true AND contact_a_id = ANY($2::uuid[])
       UNION ALL
       SELECT contact_b_id AS from_id, contact_a_id AS to_id, connection_type FROM relationship_connections
         WHERE user_id = $1 AND is_active = true AND contact_b_id = ANY($2::uuid[])`,
      [userId, frontier],
    )
    const nextFrontier: string[] = []
    for (const e of edges) {
      if (visited.has(e.to_id)) continue
      visited.add(e.to_id)
      parent.set(e.to_id, { from: e.from_id, connectionType: e.connection_type })
      nextFrontier.push(e.to_id)
    }
    if (nextFrontier.length === 0) break

    const { rows: known } = await db.query(
      `SELECT co.id, COALESCE(co.custom_name, co.display_name, co.phone_number) AS name
       FROM contacts co JOIN relationships r ON r.contact_id = co.id AND r.user_id = $1
       WHERE co.id = ANY($2::uuid[]) AND r.last_interaction_at IS NOT NULL
       ORDER BY r.health_score DESC LIMIT 1`,
      [userId, nextFrontier],
    )
    if (known.length > 0) {
      const chain: string[] = [known[0].id]
      while (chain[chain.length - 1] !== targetContactId) {
        const p = parent.get(chain[chain.length - 1])
        if (!p) break
        chain.push(p.from)
      }
      const { rows: nameRows } = await db.query(
        'SELECT id, COALESCE(custom_name, display_name, phone_number) AS name FROM contacts WHERE id = ANY($1::uuid[])',
        [chain],
      )
      const nameById = new Map(nameRows.map((r: any) => [r.id, r.name]))
      const path: IntroductionPathHop[] = chain.map((id, i) => ({
        contactId: id,
        contactName: nameById.get(id) ?? id,
        connectionType: i < chain.length - 1 ? (parent.get(id)?.connectionType ?? null) : null,
      }))
      return { targetContactId, targetContactName: target.name, path, isDirect: false }
    }
    frontier = nextFrontier
  }

  return { targetContactId, targetContactName: target.name, path: [], isDirect: false }
}
