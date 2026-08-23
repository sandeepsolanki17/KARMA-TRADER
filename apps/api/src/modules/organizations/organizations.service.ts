import { z } from 'zod';
import { withTransaction } from '../../db/pool.js';
import * as repo from './organizations.repo.js';
import type { Organization } from '@karma/types';

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export class SlugTakenError extends Error {
  constructor(slug: string) {
    super(`The slug "${slug}" is already taken. Choose a different one.`);
  }
}

export class AlreadyHasOrgError extends Error {
  constructor() {
    super('This admin already has an organization.');
  }
}

/**
 * Creates a new organization for an admin user. Called after the admin first
 * signs in and is prompted to set up their organization.
 */
export async function createOrganization(
  ownerUserId: string,
  input: CreateOrganizationInput,
): Promise<Organization> {
  const existing = await repo.findOrgByOwner(ownerUserId);
  if (existing) throw new AlreadyHasOrgError();

  const slugTaken = await repo.isSlugTaken(input.slug);
  if (slugTaken) throw new SlugTakenError(input.slug);

  return withTransaction(async (dbClient) =>
    repo.createOrganization(ownerUserId, input.name, input.slug, dbClient),
  );
}

export const findOrgByOwner = repo.findOrgByOwner;
export const findOrgById = repo.findOrgById;
