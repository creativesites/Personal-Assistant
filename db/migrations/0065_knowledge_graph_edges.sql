-- Zuri Neural Layer Phase 4 — Knowledge Graph Query Layer (see
-- docs/NEURAL_LAYER_PLAN.md §4.5/§10). Per the plan's own recommendation,
-- structural relationships (contact_products, supplier_products,
-- deal_id/project_id FKs, goal_linked_entities, etc.) are NOT backfilled
-- into this table — a query-time traversal layer unions those existing FK
-- relationships with this smaller table, which holds only edges an AI
-- pass infers (not already expressed by a foreign key anywhere).

CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_entity_type VARCHAR(20) NOT NULL,   -- 'contact' | 'product' | 'supplier' | 'project' | 'deal' | 'document'
  from_entity_id  UUID NOT NULL,
  to_entity_type  VARCHAR(20) NOT NULL,
  to_entity_id    UUID NOT NULL,
  relation_type   VARCHAR(30) NOT NULL,    -- e.g. 'often_paired_with', 'competes_with', 'depends_on'
  confidence      DECIMAL(4,3) NOT NULL DEFAULT 1.0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kg_edges_from ON knowledge_graph_edges(user_id, from_entity_type, from_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_to ON knowledge_graph_edges(user_id, to_entity_type, to_entity_id);
