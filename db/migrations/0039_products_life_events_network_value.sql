-- Relationship OS Phase 3 — Products Integration & Network/Connection Value.
-- See docs/RELATIONSHIP_OS_PLAN.md §5.1/§5.6/§6.4/§6.6/§9/§12.
--
-- contact_products reuses the `products` catalog already built for Zuri
-- Marketing rather than creating a parallel one — it's the join table
-- linking a contact to a product with a relationship (purchased/interested/
-- quoted/recommended/mentioned), plus an AI-estimated replacement date for
-- consumables that feeds `opportunities` as a renewal_due row (see
-- clock_engine.py's check_product_replacements).
--
-- contact_life_events is the personal-tier analog of contact_products —
-- personal relationships don't have a product catalog, they have shared
-- history. Distinct from the routine-chat `events` table (birthdays,
-- meetings): this is specifically for major life events the AI daily
-- brief and opportunity detector key off.
--
-- relationships.network_value is business Network Value / personal
-- Connection Value, computed alongside health_score — same flexible-JSONB
-- precedent as contact_profiles.structured_attributes rather than a dozen
-- nullable columns, since the two shapes (business vs. personal) differ.

CREATE TABLE IF NOT EXISTS contact_products (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id               UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  product_id               UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  relation_type            VARCHAR(20) NOT NULL
                             CHECK (relation_type IN ('purchased', 'interested', 'quoted', 'recommended', 'mentioned')),
  quantity                 INT DEFAULT 1,
  warranty_expires_at      DATE,
  replacement_predicted_at DATE,
  source_message_ids       JSONB NOT NULL DEFAULT '[]',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, contact_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_products_contact ON contact_products(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_products_replacement
  ON contact_products(replacement_predicted_at) WHERE replacement_predicted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS contact_life_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id         UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_type         VARCHAR(30) NOT NULL
                       CHECK (event_type IN ('new_job', 'moved', 'had_child', 'got_married',
                                              'health_issue', 'loss', 'achievement', 'started_business')),
  title              VARCHAR(255) NOT NULL,
  event_date         DATE,
  ai_generated       BOOLEAN NOT NULL DEFAULT TRUE,
  source_message_ids JSONB NOT NULL DEFAULT '[]',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_life_events_contact ON contact_life_events(contact_id);

ALTER TABLE relationships ADD COLUMN IF NOT EXISTS network_value JSONB NOT NULL DEFAULT '{}';
