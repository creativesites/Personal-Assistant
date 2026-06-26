import { Pool } from 'pg';
import { config } from '../config';

export const db = new Pool({ connectionString: config.DATABASE_URL });

export async function connectDb(): Promise<void> {
  const client = await db.connect();
  await client.query('SELECT 1');
  client.release();
}
