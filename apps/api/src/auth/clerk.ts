import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyToken } from '@clerk/backend';
import { clerkAuthorizedParties, env, isClerkConfigured } from '../config/env.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      clerkUserId: string;
      /** Clerk session id (`sid` claim) — needed to revoke a specific
       * session server-side when enforcing one-device-per-client. */
      sessionId: string | null;
    };
  }
}

/**
 * Verifies the `Authorization: Bearer <session-token>` header against Clerk.
 * On success, sets `request.auth.clerkUserId`. Does NOT check roles or
 * membership — see auth/rbac.ts and the per-module route files for that.
 *
 * If Clerk isn't configured yet (local scaffolding without keys), every
 * request is rejected with a clear 500 rather than silently trusting input —
 * we never want an "auth disabled" footgun reachable by accident.
 */
export async function verifyClerkSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'unauthorized', message: 'Missing bearer token.' });
    return;
  }

  if (!isClerkConfigured) {
    reply.code(500).send({
      error: 'server_misconfigured',
      message:
        'CLERK_SECRET_KEY is not configured. Set real Clerk keys in apps/api/.env before making authenticated requests.',
    });
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      authorizedParties: clerkAuthorizedParties.length > 0 ? clerkAuthorizedParties : undefined,
    });
    request.auth = { clerkUserId: payload.sub, sessionId: (payload as { sid?: string }).sid ?? null };
  } catch (err) {
    request.log.warn({ err }, 'Clerk token verification failed');
    reply.code(401).send({ error: 'unauthorized', message: 'Invalid or expired session.' });
  }
}
