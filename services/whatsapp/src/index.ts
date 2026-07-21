import 'dotenv/config';
import { buildApp } from './app';
import { db, connectDb } from './lib/db';
import { redis } from './lib/redis';
import { config } from './config';
import { SessionManager } from './lib/session-manager';
import { startReplyConsumer } from './lib/reply-consumer';
import { startReconciliationWorker } from './lib/reconciliation-worker';
import { BaileysTransport } from './transport/baileys';
import type { TransportFactory } from './transport/types';

async function main() {
  await connectDb();

  await redis.connect();
  redis.on('error', (err) => console.error('Redis error:', err));

  const createTransport: TransportFactory = (userId, phoneNumber, forceNewQR) =>
    new BaileysTransport(userId, config.SESSIONS_DIR, phoneNumber, forceNewQR);

  const sessionManager = new SessionManager(db, redis, config.REDIS_URL, createTransport);

  const app = await buildApp(sessionManager);

  const replyWorker = startReplyConsumer(sessionManager, db, config.REDIS_URL);
  const reconWorker = startReconciliationWorker(sessionManager, db, config.REDIS_URL);

  await sessionManager.resetStaleStates().catch((err: Error) =>
    app.log.error({ err }, 'resetStaleStates failed'),
  );

  sessionManager.restoreAll().catch((err: Error) =>
    app.log.error({ err }, 'Session restore failed'),
  );

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`WhatsApp service running on :${config.PORT}`);

  const shutdown = async () => {
    app.log.info('Shutting down...');
    try {
      await sessionManager.stopAll();
    } catch (err) {
      app.log.error({ err }, 'Error stopping session manager');
    }
    await replyWorker.close();
    await reconWorker.close();
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
