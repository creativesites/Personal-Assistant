import { db } from './db'

// Platform Polish Phase 1 (docs/PLATFORM_POLISH_PLAN.md §3.2) — extracted
// out of products.ts's POST /:id/reserve so deals.ts's closed_won hook can
// reserve stock for a product-linked deal without a self HTTP round-trip.
// Same Business OS Phase E convention: increments `reserved`/decrements
// `available` without touching `stock`, logging a `committed`
// stock_movements row where previous_stock === new_stock to signal "this
// changed what's spoken for, not what's on hand."
export async function reserveStock(
  userId: string, productId: string, quantity: number, reason?: string | null,
): Promise<{ reserved: number; available: number } | null> {
  const { rows: [existing] } = await db.query<{ stock: number; reserved: number }>(
    'SELECT stock, reserved FROM products WHERE id = $1 AND user_id = $2',
    [productId, userId],
  )
  if (!existing) return null

  const newReserved = existing.reserved + quantity
  const newAvailable = Math.max(0, existing.stock - newReserved)

  await db.query(
    `INSERT INTO stock_movements (user_id, product_id, movement_type, quantity_delta, previous_stock, new_stock, reason)
     VALUES ($1, $2, 'committed', $3, $4, $4, $5)`,
    [userId, productId, quantity, existing.stock, reason ?? null],
  )
  await db.query(
    'UPDATE products SET reserved = $1, available = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4',
    [newReserved, newAvailable, productId, userId],
  )

  return { reserved: newReserved, available: newAvailable }
}
