import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Client, Device, Membership, Signal, SignalEvent } from '../types';
import { api } from './api';

export function useMyProfile(enabled = true) {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ client: Client; membership: Membership | null }>('/client/me'),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useMySignals(enabled = true) {
  return useQuery({
    queryKey: ['my-signals'],
    queryFn: () => api.get<{ signals: Signal[] }>('/client/signals').then((r) => r.signals),
    enabled,
    refetchInterval: 15_000,
  });
}

export function useSignalDetail(signalId: string | undefined) {
  return useQuery({
    queryKey: ['my-signals', signalId],
    queryFn: () => api.get<{ signal: Signal; events: SignalEvent[] }>(`/client/signals/${signalId}`),
    enabled: Boolean(signalId),
    refetchInterval: 10_000,
  });
}

export function useRegisterDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { expoPushToken: string; platform: 'IOS' | 'ANDROID'; deviceName: string | null; authToken: string }) =>
      api.post<{ device: Device; replacedDeviceId: string | null }>('/client/devices', {
        expoPushToken: params.expoPushToken,
        platform: params.platform,
        deviceName: params.deviceName,
      }, params.authToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-devices'] }),
  });
}
