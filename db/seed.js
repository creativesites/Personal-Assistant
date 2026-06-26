require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function seed() {
  const client = await pool.connect();

  try {
    const {
      rows: [user],
    } = await client.query(
      `
      INSERT INTO users (email, password_hash, full_name, timezone, onboarding_completed)
      VALUES ('dev@zuri.local', '$2b$10$placeholder_not_real', 'Dev User', 'UTC', false)
      ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
      RETURNING id, email
    `
    );
    console.log(`Dev user: ${user.id} (${user.email})`);

    await client.query(
      `
      INSERT INTO subscriptions (user_id, plan, status)
      VALUES ($1, 'starter', 'active')
      ON CONFLICT DO NOTHING
    `,
      [user.id]
    );

    await client.query(
      `
      INSERT INTO notification_preferences (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `,
      [user.id]
    );

    await client.query(
      `
      INSERT INTO calendars (user_id, name, is_default)
      VALUES ($1, 'My Calendar', true)
      ON CONFLICT DO NOTHING
    `,
      [user.id]
    );

    console.log('Seed complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
