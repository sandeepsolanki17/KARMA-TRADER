import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@karma/types';
import { createClientUser, findUserByClerkId, touchLastSeen } from './users.repo.js';
import { findClientByUserId, findClientByInvitedEmail, linkClerkIdentity } from '../modules/clients/clients.repo.js';
import { hasDifferentActiveSession } from '../modules/devices/devices.repo.js';
import { getMembershipForClient } from '../modules/membership/membership.repo.js';
import { findOrgByOwner } from '../modules/organizations/organizations.service.js';
import { clerkClient } from './clerkClient.js';
import { withTransaction } from '../db/pool.js';
import type { Client, Membership, Organization } from '@karma/types';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: User;
    currentClient?: Client;
    currentMembership?: Membership | null;
    currentOrg?: Organization | null;
  }
}

/**
 * On-demand provisioning: when a Clerk-authenticated user hits the API but
 * has no internal `users` row yet (because the `user.created` webhook hasn't
 * fired or was delayed), we look up their primary email from the Clerk API,
 * match it against a pending client invitation, and link them in one
 * transaction. This makes the auth flow work reliably WITHOUT depending on
 * the webhook being configured or timely.
 */
async function tryOnDemandProvisioning(clerkUserId: string, request: FastifyRequest): Promise<User | null> {
  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const primaryEmail = clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress;

    if (!primaryEmail) return null;

    const pendingClient = await findClientByInvitedEmail(primaryEmail);
    if (!pendingClient) return null;

    // Already linked to a DIFFERENT Clerk user — don't overwrite
    if (pendingClient.clerkUserId && pendingClient.clerkUserId !== '' && pendingClient.clerkUserId !== clerkUserId) return null;

    return await withTransaction(async (dbClient) => {
      // Double-check inside txn (prevent race with concurrent webhook)
      const existingUser = await findUserByClerkId(clerkUserId);
      if (existingUser) return existingUser;

      const user = await createClientUser(clerkUserId, dbClient);
      await linkClerkIdentity(pendingClient.id, user.id, clerkUserId, dbClient);
      request.log.info({ clerkUserId, clientId: pendingClient.id, email: primaryEmail },
        'On-demand provisioning: linked Clerk identity to pending client invite');
      return user;
    });
  } catch (err) {
    request.log.warn({ err, clerkUserId }, 'On-demand provisioning failed — will retry on next request');
    return null;
  }
}

/**
 * Loads the internal `users` row for the verified Clerk identity.
 * If no internal record exists yet, attempts on-demand provisioning by
 * matching the Clerk user's email to a pending client invitation.
 * 403s (as `account_not_provisioned`) only if provisioning also fails.
 */
async function loadCurrentUser(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (!request.auth) {
    reply.code(401).send({ error: 'unauthorized' });
    return false;
  }

  let user = await findUserByClerkId(request.auth.clerkUserId);

  // On-demand provisioning: bypass webhook dependency
  if (!user) {
    user = await tryOnDemandProvisioning(request.auth.clerkUserId, request);
  }

  if (!user) {
    reply.code(403).send({
      error: 'account_not_provisioned',
      message: 'No internal account exists for this identity yet. Ask your admin to invite you first.',
    });
    return false;
  }
  if (user.status !== 'ACTIVE') {
    reply.code(403).send({ error: 'account_not_active', status: user.status });
    return false;
  }
  request.currentUser = user;
  void touchLastSeen(user.id); // fire and forget — not on the critical path
  return true;
}

/** Use as a preHandler on any route restricted to ADMIN role. */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ok = await loadCurrentUser(request, reply);
  if (!ok) return;
  if (request.currentUser!.role !== 'ADMIN') {
    reply.code(403).send({ error: 'forbidden', message: 'Admin role required.' });
    return;
  }
  // Load and attach this admin's organization (may be null for a brand-new admin)
  request.currentOrg = await findOrgByOwner(request.currentUser!.id);
}

/**
 * Use as a preHandler on any route restricted to CLIENT role.
 * Attaches request.currentClient. Does NOT check membership — routes that
 * serve live signal content must also apply `requireActiveMembership`.
 */
export async function requireClient(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ok = await loadCurrentUser(request, reply);
  if (!ok) return;
  if (request.currentUser!.role !== 'CLIENT') {
    reply.code(403).send({ error: 'forbidden', message: 'Client role required.' });
    return;
  }
  const client = await findClientByUserId(request.currentUser!.id);
  if (!client) {
    reply.code(403).send({ error: 'account_not_provisioned' });
    return;
  }
  if (client.status !== 'ACTIVE') {
    reply.code(403).send({ error: 'client_not_active', status: client.status });
    return;
  }

  // A newly authenticated phone needs exactly one unauthenticated-by-device
  // request: POST /client/devices, which atomically activates its session and
  // revokes the old one. Every other client request is denied immediately if
  // a different active session exists. This is the server-side half of the
  // one-active-device guarantee; client-side sign-out is only a courtesy UX.
  const isDeviceActivationRequest = request.method === 'POST' && request.routeOptions.url === '/client/devices';
  if (!isDeviceActivationRequest) {
    const sessionWasSuperseded = await hasDifferentActiveSession(client.id, request.auth!.sessionId);
    if (sessionWasSuperseded) {
      reply.code(401).send({
        error: 'device_revoked',
        message: 'This account was activated on another device. Sign in again to continue.',
      });
      return;
    }
  }
  request.currentClient = client;
}

/**
 * Chain after `requireClient`. Rejects when membership is missing, expired,
 * or cancelled. Required on every route that serves *live* signal content or
 * broker order hints — historical/entitled-only views may use a lighter check.
 */
export async function requireActiveMembership(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.currentClient) {
    reply.code(500).send({ error: 'internal_error', message: 'requireActiveMembership used without requireClient' });
    return;
  }
  const membership = await getMembershipForClient(request.currentClient.id);
  const now = new Date();
  const isActive = membership && membership.status === 'ACTIVE' && new Date(membership.expiresAt) > now;
  if (!isActive) {
    reply.code(403).send({
      error: 'membership_inactive',
      message: 'Your membership is inactive or expired. Contact your admin to renew.',
    });
    return;
  }
  request.currentMembership = membership;
}
