import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import { env, isExpoPushConfigured } from '../../config/env.js';
import { adminRevokeDevice } from '../devices/devices.repo.js';

const expo = new Expo({ accessToken: isExpoPushConfigured ? env.EXPO_ACCESS_TOKEN : undefined });

export class PushDeliveryError extends Error {}

export interface SendPushParams {
  expoPushToken: string;
  deviceId: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority: 'default' | 'high';
}

/**
 * Sends a single push message via Expo's HTTP API and interprets the ticket.
 * `DeviceNotRegistered` errors auto-revoke the device — a stale token should
 * never keep accumulating failed delivery attempts.
 */
export async function sendExpoPush(params: SendPushParams): Promise<void> {
  if (!Expo.isExpoPushToken(params.expoPushToken)) {
    await adminRevokeDevice(params.deviceId);
    throw new PushDeliveryError(`Not a valid Expo push token — device ${params.deviceId} revoked.`);
  }

  const message: ExpoPushMessage = {
    to: params.expoPushToken,
    title: params.title,
    body: params.body,
    data: params.data,
    priority: params.priority,
    sound: 'default',
    channelId: params.priority === 'high' ? 'karma-critical' : 'karma-signals',
  };

  const [ticket] = (await expo.sendPushNotificationsAsync([message])) as ExpoPushTicket[];

  if (!ticket) {
    throw new PushDeliveryError('Expo returned no ticket for the push message.');
  }
  if (ticket.status === 'error') {
    if (ticket.details?.error === 'DeviceNotRegistered') {
      await adminRevokeDevice(params.deviceId);
    }
    throw new PushDeliveryError(ticket.message ?? 'Expo push send failed.');
  }
}
