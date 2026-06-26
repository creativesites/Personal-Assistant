import dns from 'dns';
import { Pool } from 'pg';
import { config } from '../config';

// Supabase resolves to IPv6 on some hosts; force IPv4 to avoid ENETUNREACH
dns.setDefaultResultOrder('ipv4first');

export const db = new Pool({ connectionString: config.DATABASE_URL });

export async function connectDb(): Promise<void> {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await db.connect();
      await client.query('SELECT 1');
      client.release();
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const delay = Math.min(1000 * attempt, 10000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
