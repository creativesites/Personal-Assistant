import 'dotenv/config';
import { buildApp } from './app';
import { connectDb } from './lib/db';
import { redis } from './lib/redis';
import { config } from './config';

async function main() {
  const app = await buildApp();

  await connectDb();
  app.log.info('Database connected');

  await redis.connect();
  redis.on('error', (err) => app.log.error({ err }, 'Redis error'));
  app.log.info('Redis connected');

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
