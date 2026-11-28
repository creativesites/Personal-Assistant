import 'dotenv/config';
import { buildApp } from './app';
import { connectDb } from './lib/db';
import { redis } from './lib/redis';
import { redisSub, startRedisSubscriber } from './lib/redis-subscriber';
import { setupSocket } from './lib/socket';
import { isTokenTrusted } from './lib/device-sessions';
import { config } from './config';
import { startSocialPublishWorker } from './workers/social-publish-worker';
import { startRecurringDocumentsWorker } from './workers/recurring-documents-worker';
import { startSubscriptionLifecycleWorker } from './workers/subscription-lifecycle-worker';
import { startDunningReminderWorker } from './workers/dunning-reminder-worker';
import { startAvatarBackfillWorker } from './workers/avatar-backfill-worker';
import { startDeviceCaptureWorker } from './workers/device-capture-worker';
import { startNetworkNudgeWorker } from './workers/network-nudge-worker';
import { startDisconnectChecker, stopDisconnectChecker } from './lib/disconnect-checker';

async function main() {
  const app = await buildApp();

  await connectDb();
  app.log.info('Database connected');

  await redis.connect();
  redis.on('error', (err) => app.log.error({ err }, 'Redis error'));
  app.log.info('Redis connected');

  // listen() must come before Socket.io setup — fastify.server is only bound after listen
  await app.listen({ port: config.PORT, host: '0.0.0.0' });

  const io = setupSocket(app.server, async (token) => {
    const payload = app.jwt.verify<{ userId: string; sid?: string; tv?: number }>(token);
    if (!(await isTokenTrusted(payload))) throw new Error('revoked');
    return payload;
  });
  app.log.info('Socket.io initialised');

  await redisSub.connect();
  startRedisSubscriber(io);
  app.log.info('Redis subscriber running');

  const socialPublishWorker = startSocialPublishWorker(app.log);
  app.log.info('Social publish worker running');

  const recurringDocumentsWorker = startRecurringDocumentsWorker(app.log);
  app.log.info('Recurring documents worker running');

  const subscriptionLifecycleWorker = startSubscriptionLifecycleWorker(app.log);
  app.log.info('Subscription lifecycle worker running');

  const dunningReminderWorker = startDunningReminderWorker(app.log);
  app.log.info('Dunning reminder worker running');

  const avatarBackfillWorker = startAvatarBackfillWorker(app.log);
  app.log.info('Avatar backfill worker running');

  const deviceCaptureWorker = startDeviceCaptureWorker(app.log);
  app.log.info('Device capture worker running');

  const networkNudgeWorker = startNetworkNudgeWorker(app.log);
  app.log.info('Network nudge worker running');

  startDisconnectChecker();
  app.log.info('WhatsApp disconnect checker running');

  const shutdown = async () => {
    app.log.info('Shutting down...');
    stopDisconnectChecker();
    socialPublishWorker.stop();
    recurringDocumentsWorker.stop();
    subscriptionLifecycleWorker.stop();
    dunningReminderWorker.stop();
    avatarBackfillWorker.stop();
    deviceCaptureWorker.stop();
    networkNudgeWorker.stop();
    await app.close();
    redisSub.disconnect();
    await redis.quit();
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
