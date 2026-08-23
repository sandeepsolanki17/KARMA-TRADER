import type {
  AccountStatus,
  BrokerId,
  DevicePlatform,
  MembershipStatus,
  NotificationJobStatus,
  NotificationPriority,
  SignalEventType,
  SignalSide,
  SignalStatus,
  UserRole,
} from './enums';

export interface User {
  id: string;
  clerkUserId: string;
  role: UserRole;
  status: AccountStatus;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface Client {
  id: string;
  clerkUserId: string;
  name: string;
  phone: string | null;
  preferredBroker: BrokerId;
  status: AccountStatus;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface Membership {
  id: string;
  clientId: string;
  status: MembershipStatus;
  startsAt: string;
  expiresAt: string;
  lastPaymentMarkedAt: string | null;
  lastPaymentMarkedByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  clientId: string;
  expoPushToken: string;
  platform: DevicePlatform;
  deviceName: string | null;
  revokedAt: string | null;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface TradePlan {
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number | null;
  target3: number | null;
  partialExitPercentages: {
    t1?: number;
    t2?: number;
    t3?: number;
  } | null;
}

export interface BrokerOrderHint {
  broker: BrokerId;
  exchange: string;
  tradingSymbol: string;
  symbolToken: string | null;
  side: SignalSide;
  orderType: 'MARKET' | 'LIMIT';
  productType: string | null;
  quantity: number | null;
}

export interface Signal {
  id: string;
  createdByAdminId: string;
  status: SignalStatus;
  side: SignalSide;
  instrumentDisplayName: string;
  tradePlan: TradePlan;
  brokerOrderHint: BrokerOrderHint;
  notes: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SignalEvent {
  id: string;
  signalId: string;
  eventType: SignalEventType;
  payload: Record<string, unknown>;
  createdByAdminId: string;
  createdAt: string;
  idempotencyKey: string;
}

export interface SignalRecipient {
  signalId: string;
  clientId: string;
  addedAt: string;
}

export interface NotificationJob {
  id: string;
  signalId: string;
  clientId: string;
  deviceId: string;
  eventType: SignalEventType;
  priority: NotificationPriority;
  status: NotificationJobStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface AuditEvent {
  id: string;
  actorAdminId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
