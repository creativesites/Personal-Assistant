import 'dotenv/config';
import { buildApp } from './app';
import { db, connectDb } from './lib/db';
import { redis } from './lib/redis';
import { config } from './config';
import { SessionManager } from './lib/session-manager';
import { startReplyConsumer } from './lib/reply-consumer';

async function main() {
  await connectDb();

  await redis.connect();
  redis.on('error', (err) => console.error('Redis error:', err));

  const sessionManager = new SessionManager(db, redis, config.REDIS_URL);

  const app = await buildApp(sessionManager);

  const replyWorker = startReplyConsumer(sessionManager, db, config.REDIS_URL);

  // Restore connected sessions from DB (fire-and-forget)
  sessionManager.restoreAll().catch((err: Error) =>
    app.log.error({ err }, 'Session restore failed')
  );

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`WhatsApp service running on :${config.PORT}`);

  const shutdown = async () => {
    app.log.info('Shutting down...');
    await replyWorker.close();
    await app.close();
    await redis.quit();
    await db.end();
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
