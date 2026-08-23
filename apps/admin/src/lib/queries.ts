import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditEvent,
  Client,
  CreateClientInput,
  CreateSignalDraftInput,
  Membership,
  Signal,
  SignalEvent,
} from '@karma/types';
import { api } from './api';

const idempotencyKey = () => crypto.randomUUID();

// ---------- Clients ----------

export interface ClientListItem extends Client {
  joinedAt: string | null;
  invitedEmail: string;
}

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<{ clients: ClientListItem[] }>('/admin/clients').then((r) => r.clients),
    refetchInterval: 15_000,
  });
}

export function useClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ['clients', clientId],
    queryFn: () =>
      api.get<{ client: Client; membership: Membership | null }>(`/admin/clients/${clientId}`),
    enabled: Boolean(clientId),
  });
}

export function useInviteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClientInput) => api.post<{ client: Client }>('/admin/clients', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}

export function useSetClientStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, action }: { clientId: string; action: 'activate' | 'suspend' | 'deactivate' }) =>
      api.post<{ client: Client }>(`/admin/clients/${clientId}/${action}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['clients', vars.clientId] });
    },
  });
}

export function useExtendMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, days, markPaymentReceived }: { clientId: string; days: number; markPaymentReceived: boolean }) =>
      api.post<{ membership: Membership }>(`/admin/clients/${clientId}/membership/extend`, {
        days,
        markPaymentReceived,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['clients', vars.clientId] });
    },
  });
}

export function useMarkPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, note }: { clientId: string; note?: string }) =>
      api.post<{ membership: Membership }>(`/admin/clients/${clientId}/membership/mark-payment`, { note }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['clients', vars.clientId] }),
  });
}

// ---------- Signals ----------

export function useSignals() {
  return useQuery({
    queryKey: ['signals'],
    queryFn: () => api.get<{ signals: Signal[] }>('/admin/signals').then((r) => r.signals),
    refetchInterval: 10_000,
  });
}

export interface DeliverySummary {
  pending: number;
  sent: number;
  failed: number;
  deadLetter: number;
}

export function useSignal(signalId: string | undefined) {
  return useQuery({
    queryKey: ['signals', signalId],
    queryFn: () =>
      api.get<{ signal: Signal; events: SignalEvent[]; delivery: DeliverySummary }>(`/admin/signals/${signalId}`),
    enabled: Boolean(signalId),
    refetchInterval: 8_000,
  });
}

export function useCreateSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSignalDraftInput) => api.post<{ signal: Signal }>('/admin/signals', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['signals'] }),
  });
}

type SignalAction =
  | 'publish'
  | 'entry-hit'
  | 't1-hit'
  | 't2-hit'
  | 't3-hit'
  | 'close'
  | 'cancel'
  | 'expire'
  | 'exit-now';

function useSignalAction(action: SignalAction) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ signalId, body }: { signalId: string; body?: Record<string, unknown> }) =>
      api.post(`/admin/signals/${signalId}/${action}`, { idempotencyKey: idempotencyKey(), ...body }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['signals'] });
      qc.invalidateQueries({ queryKey: ['signals', vars.signalId] });
    },
  });
}

export function usePublishSignal() {
  return useSignalAction('publish');
}
export function useMarkEntryHit() {
  return useSignalAction('entry-hit');
}
export function useMarkT1Hit() {
  return useSignalAction('t1-hit');
}
export function useMarkT2Hit() {
  return useSignalAction('t2-hit');
}
export function useMarkT3Hit() {
  return useSignalAction('t3-hit');
}
export function useCloseSignal() {
  return useSignalAction('close');
}
export function useCancelSignal() {
  return useSignalAction('cancel');
}
export function useExpireSignal() {
  return useSignalAction('expire');
}
export function useExitNow() {
  return useSignalAction('exit-now');
}

export function useUpdateStopLoss() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ signalId, stopLoss }: { signalId: string; stopLoss: number }) =>
      api.post(`/admin/signals/${signalId}/stop-loss`, { stopLoss, idempotencyKey: idempotencyKey() }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['signals'] });
      qc.invalidateQueries({ queryKey: ['signals', vars.signalId] });
    },
  });
}

// ---------- Audit ----------

export function useAuditEvents() {
  return useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get<{ events: AuditEvent[] }>('/admin/audit').then((r) => r.events),
    refetchInterval: 20_000,
  });
}
