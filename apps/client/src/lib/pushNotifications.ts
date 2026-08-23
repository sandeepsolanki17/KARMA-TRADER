import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useRegisterDevice } from './queries';

type ClerkGetToken = () => Promise<string | null>;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type DeviceActivationState = 'activating' | 'ready' | 'permission_required' | 'failed';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForClerkToken(getToken: ClerkGetToken, retries = 10): Promise<string | null> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const token = await getToken();
    if (token) return token;
    await sleep(350);
  }
  return null;
}

export function usePushNotifications(
  getToken: ClerkGetToken,
  enabled: boolean,
): DeviceActivationState {
  const router = useRouter();
  const registerDevice = useRegisterDevice();
  const didRegister = useRef(false);
  const [state, setState] = useState<DeviceActivationState>('activating');

  useEffect(() => {
    if (!enabled || didRegister.current) return;
    didRegister.current = true;

    (async () => {
      if (!Device.isDevice) {
        console.warn('Push notifications require a physical device.');
        setState('failed');
        return;
      }

      const clerkToken = await waitForClerkToken(getToken);
      if (!clerkToken) {
        console.warn('Device activation skipped: Clerk session token is not ready.');
        setState('failed');
        return;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.warn('Notification permission denied — device cannot be activated for live signal alerts.');
        setState('permission_required');
        return;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('karma-signals', {
          name: 'Signal updates',
          importance: Notifications.AndroidImportance.HIGH,
        });
        await Notifications.setNotificationChannelAsync('karma-critical', {
          name: 'Emergency exits',
          importance: Notifications.AndroidImportance.MAX,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
        });
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        console.warn('Device activation failed: EAS projectId is missing.');
        setState('failed');
        return;
      }

      let expoPushToken: string;
      try {
        expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        if (!expoPushToken.startsWith('ExponentPushToken[')) {
          throw new Error('Expo push service returned an invalid push token.');
        }
      } catch (error) {
        console.warn('Device activation failed while obtaining a real push token:', error);
        setState('failed');
        return;
      }

      try {
        await registerDevice.mutateAsync({
          expoPushToken,
          platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
          deviceName: Device.deviceName ?? null,
          authToken: clerkToken,
        });
        setState('ready');
      } catch (error) {
        console.warn('Device activation failed:', error);
        setState('failed');
      }
    })().catch((error) => {
      console.warn('Device activation crashed unexpectedly:', error);
      setState('failed');
    });
  }, [enabled, getToken, registerDevice]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { signalId?: string };
      if (data?.signalId) {
        router.push(`/signal/${data.signalId}`);
      }
    });
    return () => sub.remove();
  }, [router]);

  return state;
}
