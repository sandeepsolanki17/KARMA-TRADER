import closeWithGrace from 'close-with-grace';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { closeQueues } from './modules/notifications/queue.js';
import { startNotificationWorkers } from './modules/notifications/worker.js';
import { sweepExpiredMemberships } from './modules/membership/membership.service.js';
import { sweepExpiredSignals } from './modules/signals/signalExpirySweep.js';

async function main() {
  const app = await buildApp();

  const workers = startNotificationWorkers(app.log);

  // Periodic sweeps: membership expiry and signal expiry are time-based
  // transitions with no admin action to trigger them. Every 60s is frequent
  // enough for a signals product without hammering the DB.
  const sweepInterval = setInterval(() => {
    sweepExpiredMemberships().catch((err) => app.log.error({ err }, 'membership sweep failed'));
    sweepExpiredSignals().catch((err) => app.log.error({ err }, 'signal expiry sweep failed'));
  }, 60_000);

  await app.listen({ port: env.PORT, host: '0.0.0.0' });

  closeWithGrace({ delay: 5000 }, async ({ err }) => {
    if (err) app.log.error({ err }, 'Shutting down due to error');
    clearInterval(sweepInterval);
    await Promise.all(workers.map((w) => w.close()));
    await closeQueues();
    await pool.end();
    await app.close();
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
