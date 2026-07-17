import { db } from './db'

// Platform Polish Phase 3 (§5.3) — a merge never deletes the duplicate
// contact row: 47+ tables reference contacts(id), many ON DELETE CASCADE,
// so deleting it would silently destroy history (insights, health logs,
// business_events, etc.). Instead the explicitly-scoped tables
// (conversations, deals, documents — messages move along with their
// conversation) are reassigned to the primary contact, and the duplicate
// is marked merged_into_id (migration 0088) so it drops out of default
// contact listings without losing its own row or anything still pointing
// at it directly.
export async function mergeContacts(
  userId: string,
  primaryContactId: string,
  duplicateContactId: string,
): Promise<void> {
  if (primaryContactId === duplicateContactId) {
    throw new Error('Cannot merge a contact into itself')
  }

  const client = await db.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `SELECT id, merged_into_id FROM contacts WHERE id = ANY($1::uuid[]) AND user_id = $2`,
      [[primaryContactId, duplicateContactId], userId],
    )
    if (rows.length !== 2) {
      throw new Error('Both contacts must belong to the current user')
    }
    if (rows.some((r) => r.merged_into_id !== null)) {
      throw new Error('One of these contacts has already been merged')
    }

    await client.query(
      `UPDATE conversations SET contact_id = $1 WHERE contact_id = $2 AND user_id = $3`,
      [primaryContactId, duplicateContactId, userId],
    )
    await client.query(
      `UPDATE deals SET contact_id = $1 WHERE contact_id = $2 AND user_id = $3`,
      [primaryContactId, duplicateContactId, userId],
    )
    await client.query(
      `UPDATE documents SET contact_id = $1 WHERE contact_id = $2 AND user_id = $3`,
      [primaryContactId, duplicateContactId, userId],
    )
    await client.query(
      `UPDATE contacts SET merged_into_id = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
      [primaryContactId, duplicateContactId, userId],
    )

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
