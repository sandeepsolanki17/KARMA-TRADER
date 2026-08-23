import type { FastifyInstance } from 'fastify';
import { Webhook } from 'svix';
import { withTransaction } from '../../db/pool.js';
import { createAdminUser, createClientUser, findUserByClerkId } from '../../auth/users.repo.js';
import { findClientByInvitedEmail, linkClerkIdentity } from '../clients/clients.repo.js';

interface ClerkUserCreatedEvent {
  type: string;
  data: {
    id: string;
    email_addresses: { id: string; email_address: string }[];
    primary_email_address_id: string;
    public_metadata?: { role?: 'ADMIN' | 'CLIENT' };
  };
}

/**
 * Registers POST /webhooks/clerk. Must be mounted BEFORE any body-parsing
 * that would prevent access to the raw payload — svix verification needs
 * the exact bytes Clerk signed.
 *
 * Configure this URL (https://<your-domain>/webhooks/clerk) in the Clerk
 * dashboard under Webhooks, subscribed to `user.created`, and set
 * CLERK_WEBHOOK_SECRET in .env. Requires a real Clerk project — cannot be
 * exercised without one.
 */
export function registerClerkWebhookRoutes(app: FastifyInstance, webhookSecret: string) {
  app.post(
    '/webhooks/clerk',
    {
      config: { rawBody: true },
    },
    async (request, reply) => {
      if (!webhookSecret) {
        reply.code(500).send({ error: 'server_misconfigured', message: 'CLERK_WEBHOOK_SECRET not set.' });
        return;
      }

      const svixId = request.headers['svix-id'];
      const svixTimestamp = request.headers['svix-timestamp'];
      const svixSignature = request.headers['svix-signature'];
      if (!svixId || !svixTimestamp || !svixSignature) {
        reply.code(400).send({ error: 'missing_svix_headers' });
        return;
      }

      const wh = new Webhook(webhookSecret);
      let event: ClerkUserCreatedEvent;
      try {
        event = wh.verify(request.rawBody as string, {
          'svix-id': svixId as string,
          'svix-timestamp': svixTimestamp as string,
          'svix-signature': svixSignature as string,
        }) as ClerkUserCreatedEvent;
      } catch (err) {
        request.log.warn({ err }, 'Clerk webhook signature verification failed');
        reply.code(400).send({ error: 'invalid_signature' });
        return;
      }

      if (event.type !== 'user.created') {
        reply.code(200).send({ ok: true, ignored: event.type });
        return;
      }

      const clerkUserId = event.data.id;
      const primaryEmail = event.data.email_addresses.find(
        (e) => e.id === event.data.primary_email_address_id,
      )?.email_address;

      const alreadyLinked = await findUserByClerkId(clerkUserId);
      if (alreadyLinked) {
        reply.code(200).send({ ok: true, alreadyLinked: true });
        return;
      }

      const role = event.data.public_metadata?.role;

      if (role === 'ADMIN') {
        await createAdminUser(clerkUserId);
        reply.code(200).send({ ok: true, linked: 'admin' });
        return;
      }

      if (!primaryEmail) {
        reply.code(200).send({ ok: true, ignored: 'no_primary_email' });
        return;
      }
      const pendingClient = await findClientByInvitedEmail(primaryEmail);
      if (!pendingClient) {
        // Someone signed up without an admin-issued invitation — do not auto-provision.
        request.log.warn({ primaryEmail }, 'user.created for unrecognized email — no matching client invite');
        reply.code(200).send({ ok: true, ignored: 'no_matching_invite' });
        return;
      }

      await withTransaction(async (dbClient) => {
        const user = await createClientUser(clerkUserId, dbClient);
        await linkClerkIdentity(pendingClient.id, user.id, clerkUserId, dbClient);
      });

      reply.code(200).send({ ok: true, linked: 'client', clientId: pendingClient.id });
    },
  );
}
