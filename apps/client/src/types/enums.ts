// Shared enums — single source of truth across api / admin / client.
// Keep these in sync with infra/postgres migrations (CHECK constraints mirror these values).

export const UserRole = {
  ADMIN: 'ADMIN',
  CLIENT: 'CLIENT',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const AccountStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DEACTIVATED: 'DEACTIVATED',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const MembershipStatus = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus];

export const SignalStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ENTRY_HIT: 'ENTRY_HIT',
  T1_HIT: 'T1_HIT',
  T2_HIT: 'T2_HIT',
  T3_HIT: 'T3_HIT',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  EXITED: 'EXITED',
  CLOSED: 'CLOSED',
} as const;
export type SignalStatus = (typeof SignalStatus)[keyof typeof SignalStatus];

export const TERMINAL_SIGNAL_STATUSES: ReadonlySet<SignalStatus> = new Set([
  SignalStatus.CANCELLED,
  SignalStatus.EXPIRED,
  SignalStatus.EXITED,
  SignalStatus.CLOSED,
]);

export const SignalSide = {
  BUY: 'BUY',
  SELL: 'SELL',
} as const;
export type SignalSide = (typeof SignalSide)[keyof typeof SignalSide];

export const SignalEventType = {
  CREATED: 'CREATED',
  PUBLISHED: 'PUBLISHED',
  SL_UPDATED: 'SL_UPDATED',
  TARGETS_UPDATED: 'TARGETS_UPDATED',
  ENTRY_HIT: 'ENTRY_HIT',
  T1_HIT: 'T1_HIT',
  T2_HIT: 'T2_HIT',
  T3_HIT: 'T3_HIT',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  EXIT_NOW: 'EXIT_NOW',
  CLOSED: 'CLOSED',
  NOTE_ADDED: 'NOTE_ADDED',
} as const;
export type SignalEventType = (typeof SignalEventType)[keyof typeof SignalEventType];

export const NotificationJobStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  DEAD_LETTER: 'DEAD_LETTER',
} as const;
export type NotificationJobStatus = (typeof NotificationJobStatus)[keyof typeof NotificationJobStatus];

export const NotificationPriority = {
  NORMAL: 'NORMAL',
  CRITICAL: 'CRITICAL',
} as const;
export type NotificationPriority = (typeof NotificationPriority)[keyof typeof NotificationPriority];

export const BrokerId = {
  ANGEL_ONE: 'ANGEL_ONE',
} as const;
export type BrokerId = (typeof BrokerId)[keyof typeof BrokerId];

export const DevicePlatform = {
  IOS: 'IOS',
  ANDROID: 'ANDROID',
} as const;
export type DevicePlatform = (typeof DevicePlatform)[keyof typeof DevicePlatform];

export const AuditAction = {
  CLIENT_CREATED: 'CLIENT_CREATED',
  CLIENT_INVITED: 'CLIENT_INVITED',
  CLIENT_ACTIVATED: 'CLIENT_ACTIVATED',
  CLIENT_DEACTIVATED: 'CLIENT_DEACTIVATED',
  CLIENT_SUSPENDED: 'CLIENT_SUSPENDED',
  CLIENT_RESTORED: 'CLIENT_RESTORED',
  MEMBERSHIP_EXTENDED: 'MEMBERSHIP_EXTENDED',
  MEMBERSHIP_PAYMENT_MARKED: 'MEMBERSHIP_PAYMENT_MARKED',
  DEVICE_REGISTERED: 'DEVICE_REGISTERED',
  DEVICE_REVOKED: 'DEVICE_REVOKED',
  SIGNAL_CREATED: 'SIGNAL_CREATED',
  SIGNAL_PUBLISHED: 'SIGNAL_PUBLISHED',
  SIGNAL_UPDATED: 'SIGNAL_UPDATED',
  SIGNAL_CANCELLED: 'SIGNAL_CANCELLED',
  SIGNAL_EXIT_NOW: 'SIGNAL_EXIT_NOW',
  ADMIN_LOGIN: 'ADMIN_LOGIN',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
