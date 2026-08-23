import type { AccountStatus, Client, CreateClientInput } from '@karma/types';
import { withTransaction } from '../../db/pool.js';
import { clerkClient } from '../../auth/clerkClient.js';
import * as repo from './clients.repo.js';
import { createInitialMembership } from '../membership/membership.repo.js';
import { recordAuditEvent } from '../audit/audit.service.js';

export class DuplicateInviteError extends Error {
  constructor(email: string) {
    super(`A client has already been invited with email ${email}`);
  }
}

/**
 * Invites a new client: creates the Clerk invitation first (fail fast, no
 * partial DB state if Clerk rejects the email), then persists the pending
 * client + an EXPIRED membership placeholder in one transaction. The client
 * only becomes usable once they accept and the `user.created` webhook links
 * their Clerk identity — see webhooks/clerk.webhook.ts.
 */
export async function inviteClient(adminId: string, input: CreateClientInput): Promise<Client> {
  const existing = await repo.findClientByInvitedEmail(input.email);
  if (existing) {
    throw new DuplicateInviteError(input.email);
  }

  await clerkClient.invitations.createInvitation({
    emailAddress: input.email,
    publicMetadata: { role: 'CLIENT' },
    notify: true,
  });

  return withTransaction(async (dbClient) => {
    const client = await repo.insertPendingClient(
      { name: input.name, phone: input.phone ?? null, preferredBroker: input.preferredBroker, invitedEmail: input.email },
      dbClient,
    );
    await createInitialMembership(client.id, dbClient);
    await recordAuditEvent(
      {
        actorAdminId: adminId,
        action: 'CLIENT_INVITED',
        targetType: 'client',
        targetId: client.id,
        metadata: { email: input.email },
      },
      dbClient,
    );
    return client;
  });
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
