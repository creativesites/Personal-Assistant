"""Zuri Neural Layer — Knowledge Graph Query Layer (docs/NEURAL_LAYER_PLAN.md §4.5).

A named traversal contract over relationships that already exist as
foreign keys (contact_products, supplier_products, etc.) plus the smaller
knowledge_graph_edges table for AI-inferred edges no FK expresses. Per the
plan's own recommendation, structural relationships are NOT backfilled
into knowledge_graph_edges — this module unions the existing FK tables at
query time instead.

services/api/src/lib/knowledge-graph.ts is the Node-side equivalent for
services/api's own consumers (the co-purchases endpoint) — the two
services have independent DB pools and neither calls the other's code, so
both implementations share this contract shape and both read/write the
same knowledge_graph_edges table rather than one calling the other.
"""
from ..database import get_pool


async def co_purchasers(user_id: str, product_id: str, limit: int = 3) -> list[dict]:
    """Structural edge: products co-purchased by the same contacts who
    bought `product_id`, derived from contact_products — already fully
    expressed by that FK table, so nothing to backfill into
    knowledge_graph_edges for this traversal."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            WITH base_purchasers AS (
              SELECT DISTINCT contact_id FROM contact_products
              WHERE user_id = $1 AND product_id = $2 AND relation_type = 'purchased'
            )
            SELECT p.id AS product_id, p.name AS product_name,
                   COUNT(DISTINCT cp.contact_id) AS co_count,
                   (SELECT COUNT(*) FROM base_purchasers) AS base_count
            FROM contact_products cp
            JOIN base_purchasers bp ON bp.contact_id = cp.contact_id
            JOIN products p ON p.id = cp.product_id AND p.user_id = $1
            WHERE cp.user_id = $1 AND cp.relation_type = 'purchased' AND cp.product_id != $2
            GROUP BY p.id, p.name
            ORDER BY co_count DESC
            LIMIT $3
            """,
            user_id, product_id, limit,
        )
    return [dict(r) for r in rows]


async def inferred_neighbors(user_id: str, from_entity_type: str, from_entity_id: str, limit: int = 5) -> list[dict]:
    """AI-inferred edges only — the smaller knowledge_graph_edges table.
    No current writer exists yet; this is the read side of the contract,
    ready for the first engine that wants to record an inferred edge
    (e.g. "product X competes with product Y")."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT to_entity_type, to_entity_id, relation_type, confidence
               FROM knowledge_graph_edges
               WHERE user_id = $1 AND from_entity_type = $2 AND from_entity_id = $3
               ORDER BY confidence DESC
               LIMIT $4""",
            user_id, from_entity_type, from_entity_id, limit,
        )
    return [dict(r) for r in rows]
