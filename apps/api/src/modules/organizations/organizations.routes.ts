import type { FastifyInstance } from 'fastify';
import { verifyClerkSession } from '../../auth/clerk.js';
import { requireAdmin } from '../../auth/rbac.js';
import {
  createOrganization,
  createOrganizationSchema,
  findOrgByOwner,
  AlreadyHasOrgError,
  SlugTakenError,
} from './organizations.service.js';

/**
 * Organization management routes.
 *
 * GET  /admin/organization        — get the current admin's org (null if not set up yet)
 * POST /admin/organization        — create a new org (first-time setup)
 */
export function registerOrganizationRoutes(app: FastifyInstance) {
  // Get current admin's organization (used by admin UI to gate the setup flow)
  app.get(
    '/admin/organization',
    { preHandler: [verifyClerkSession, requireAdmin] },
    async (request, reply) => {
      const org = await findOrgByOwner(request.currentUser!.id);
      reply.send({ organization: org ?? null });
    },
  );

  // Create organization (one-time setup after first admin sign-in)
  app.post(
    '/admin/organization',
    { preHandler: [verifyClerkSession, requireAdmin] },
    async (request, reply) => {
      const parsed = createOrganizationSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'validation_error', issues: parsed.error.flatten().fieldErrors });
        return;
      }

      try {
        const org = await createOrganization(request.currentUser!.id, parsed.data);
        reply.code(201).send({ organization: org });
      } catch (err) {
        if (err instanceof AlreadyHasOrgError) {
          reply.code(409).send({ error: 'already_has_org', message: err.message });
        } else if (err instanceof SlugTakenError) {
          reply.code(409).send({ error: 'slug_taken', message: err.message });
        } else {
          throw err;
        }
      }
    },
  );
}
