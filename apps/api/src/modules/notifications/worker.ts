import { Worker, type Job } from 'bullmq';
import type pino from 'pino';
import { redisConnection, type NotificationJobPayload } from './queue.js';
import { findNotificationJobById, markJobFailed, markJobSent } from './notificationJobs.repo.js';
import { findDeviceById } from '../devices/devices.repo.js';
import { findSignalById } from '../signals/signals.repo.js';
import { sendExpoPush } from './expoPush.js';
import { buildPushContent } from './messageBuilder.js';

const MAX_ATTEMPTS_BEFORE_DEAD_LETTER = 5;

async function processJob(job: Job<NotificationJobPayload>, logger: pino.BaseLogger): Promise<void> {
  const notificationJob = await findNotificationJobById(job.data.notificationJobId);
  if (!notificationJob) {
    logger.warn({ jobId: job.data.notificationJobId }, 'Notification job row missing — skipping.');
    return;
  }
  if (notificationJob.status === 'SENT') {
    return; // already delivered (defensive — BullMQ + jobId dedupe should prevent this)
  }

  const [device, signal] = await Promise.all([
    findDeviceById(notificationJob.deviceId),
    findSignalById(notificationJob.signalId),
  ]);

  if (!device || device.revokedAt) {
    await markJobFailed(notificationJob.id, 'Device revoked or missing', true);
    return;
  }
  if (!signal) {
    await markJobFailed(notificationJob.id, 'Signal missing', true);
    return;
  }

  const content = buildPushContent(signal, notificationJob.eventType);

  try {
    await sendExpoPush({
      expoPushToken: device.expoPushToken,
      deviceId: device.id,
      title: content.title,
      body: content.body,
      priority: content.priority,
      data: { signalId: signal.id, eventType: notificationJob.eventType },
    });
    await markJobSent(notificationJob.id);
  } catch (err) {
    const isFinalAttempt = job.attemptsMade + 1 >= MAX_ATTEMPTS_BEFORE_DEAD_LETTER;
    await markJobFailed(notificationJob.id, (err as Error).message, isFinalAttempt);
    throw err; // rethrow so BullMQ applies backoff/retry
  }
}

export function startNotificationWorkers(logger: pino.BaseLogger): Worker[] {
  const normalWorker = new Worker<NotificationJobPayload>('notifications-normal', (job) => processJob(job, logger), {
    connection: redisConnection,
    concurrency: 10,
  });

  // Higher concurrency + its own connection pool slot: critical (EXIT NOW) jobs
  // must never queue behind a burst of routine update notifications.
  const criticalWorker = new Worker<NotificationJobPayload>(
    'notifications-critical',
    (job) => processJob(job, logger),
    { connection: redisConnection, concurrency: 20 },
  );

  for (const worker of [normalWorker, criticalWorker]) {
    worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err: err.message }, 'Notification delivery attempt failed');
    });
  }

  return [normalWorker, criticalWorker];
}
