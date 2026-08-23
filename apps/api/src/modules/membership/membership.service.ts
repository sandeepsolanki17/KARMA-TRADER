import * as repo from './membership.repo.js';
import { recordAuditEvent } from '../audit/audit.service.js';

export async function extendMembership(
  adminId: string,
  clientId: string,
  days: number,
  markPaymentReceived: boolean,
) {
  const membership = await repo.extendMembership(clientId, days, markPaymentReceived, adminId);
  await recordAuditEvent({
    actorAdminId: adminId,
    action: 'MEMBERSHIP_EXTENDED',
    targetType: 'client',
    targetId: clientId,
    metadata: { days, markPaymentReceived, newExpiresAt: membership.expiresAt },
  });
  return membership;
}

export async function markPayment(adminId: string, clientId: string, note?: string) {
  const membership = await repo.markPayment(clientId, adminId);
  await recordAuditEvent({
    actorAdminId: adminId,
    action: 'MEMBERSHIP_PAYMENT_MARKED',
    targetType: 'client',
    targetId: clientId,
    metadata: { note },
  });
  return membership;
}

export const getMembershipForClient = repo.getMembershipForClient;
export const sweepExpiredMemberships = repo.sweepExpiredMemberships;
