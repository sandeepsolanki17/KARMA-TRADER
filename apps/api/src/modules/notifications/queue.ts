import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../../config/env.js';

export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
});

export interface NotificationJobPayload {
  notificationJobId: string;
}

/** Normal-priority signal updates: publish, SL/target updates, T1/T2/T3 hits. */
export const normalNotificationQueue = new Queue<NotificationJobPayload>('notifications-normal', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

/**
 * Dedicated high-priority queue for EXIT NOW. Kept physically separate from
 * the normal queue (not just a `priority` field) so a backlog of routine
 * update notifications can never delay an emergency exit push.
 */
export const criticalNotificationQueue = new Queue<NotificationJobPayload>('notifications-critical', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 8,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export async function closeQueues(): Promise<void> {
  await Promise.all([normalNotificationQueue.close(), criticalNotificationQueue.close()]);
  await redisConnection.quit();
}
