import type { AccountStatus, Client, CreateClientInput } from '@karma/types';
import { withTransaction } from '../../db/pool.js';
import * as repo from './clients.repo.js';
import { createInitialMembership } from '../membership/membership.repo.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { sendInvitationEmail } from '../notifications/emailService.js';
import { env } from '../../config/env.js';

export class DuplicateInviteError extends Error {
  constructor(email: string) {
    super(`A client has already been invited with email ${email}`);
  }
}

export class NoOrgError extends Error {
  constructor() {
    super('Admin must set up an organization before inviting clients.');
  }
}

/**
 * Invites a new client:
 * 1. Creates the pending client record + initial EXPIRED membership in one transaction.
 * 2. Fires off a direct SMTP invitation email (async, does NOT block the response).
 *
 * The client can sign in immediately after receiving the email:
 * - They enter their email in the KARMA app → Clerk creates their account → OTP sent
 * - On first API call, on-demand provisioning in rbac.ts links their Clerk ID to
 *   this pending client record → instant access, no webhook required.
 *
 * Previously used Clerk's hosted invitation flow which was slow and opaque.
 * Now we own the email delivery and the provisioning pipeline end-to-end.
 */
export async function inviteClient(adminId: string, orgId: string | undefined, input: CreateClientInput): Promise<Client> {
  if (!orgId) throw new NoOrgError();
  const existing = await repo.findClientByInvitedEmail(input.email);
  if (existing) {
    throw new DuplicateInviteError(input.email);
  }

  const client = await withTransaction(async (dbClient) => {
    const newClient = await repo.insertPendingClient(
      { name: input.name, phone: input.phone ?? null, preferredBroker: input.preferredBroker, invitedEmail: input.email, orgId },
      dbClient,
    );
    await createInitialMembership(newClient.id, dbClient);
    await recordAuditEvent(
      {
        actorAdminId: adminId,
        action: 'CLIENT_INVITED',
        targetType: 'client',
        targetId: newClient.id,
        metadata: { email: input.email },
      },
      dbClient,
    );
    return newClient;
  });

  // Fire and forget — email is non-critical and should not block the API response.
  // If SMTP is not configured, emailService logs a warning and returns silently.
  void sendInvitationEmail({
    toEmail: input.email,
    toName: input.name,
    apkDownloadUrl: env.APP_DOWNLOAD_URL || undefined,
  }).catch((err) => {
    // Log the error but don't propagate — the client record already exists in DB.
    console.error('[KARMA] Failed to send invitation email:', err?.message ?? err);
  });

  return client;
}

export async function setStatus(adminId: string, clientId: string, status: AccountStatus): Promise<Client | null> {
  const updated = await repo.setClientStatus(clientId, status);
  if (updated) {
    const action =
      status === 'ACTIVE' ? 'CLIENT_RESTORED' : status === 'SUSPENDED' ? 'CLIENT_SUSPENDED' : 'CLIENT_DEACTIVATED';
    await recordAuditEvent({ actorAdminId: adminId, action, targetType: 'client', targetId: clientId });
  }
  return updated;
}

export const listClients = repo.listClients;
export const findClientById = repo.findClientById;
