-- Stock movements — proper inventory audit trail (see CLAUDE.md "Studio ERP").
-- Previously stock updates were a blind overwrite (PATCH /api/products/:id
-- {stock: N}) with no record of why it changed. This tracks every adjustment
-- as a typed, reasoned movement so stock levels are auditable and the
-- Inventory tab can show real history instead of just the current number.

CREATE TYPE stock_movement_type AS ENUM ('restock', 'sale', 'adjustment', 'waste', 'return');

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_type stock_movement_type NOT NULL,
  quantity_delta INT NOT NULL, -- positive for restock/return, negative for sale/waste
  previous_stock INT NOT NULL,
  new_stock INT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX idx_stock_movements_user ON stock_movements(user_id, created_at DESC);
