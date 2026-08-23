import type { PoolClient } from 'pg';
import type { Organization } from '@karma/types';
import { pool } from '../../db/pool.js';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  status: 'ACTIVE' | 'SUSPENDED';
  created_at: string;
  updated_at: string;
}

function toOrg(row: OrgRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerUserId: row.owner_user_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findOrgById(orgId: string): Promise<Organization | null> {
  const { rows } = await pool.query<OrgRow>('SELECT * FROM organizations WHERE id = $1', [orgId]);
  return rows[0] ? toOrg(rows[0]) : null;
}

export async function findOrgByOwner(ownerUserId: string): Promise<Organization | null> {
  const { rows } = await pool.query<OrgRow>('SELECT * FROM organizations WHERE owner_user_id = $1 LIMIT 1', [ownerUserId]);
  return rows[0] ? toOrg(rows[0]) : null;
}

/** Creates a new organization and links the owner's user row to it in a single transaction. */
export async function createOrganization(
  ownerUserId: string,
  name: string,
  slug: string,
  dbClient: PoolClient,
): Promise<Organization> {
  const { rows } = await dbClient.query<OrgRow>(
    `INSERT INTO organizations (name, slug, owner_user_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, slug, ownerUserId],
  );
  const org = toOrg(rows[0]!);

  // Link the admin user to the org
  await dbClient.query('UPDATE users SET org_id = $1 WHERE id = $2', [org.id, ownerUserId]);

  return org;
}

/** Slug uniqueness check — before attempting insert. */
export async function isSlugTaken(slug: string): Promise<boolean> {
  const { rows } = await pool.query('SELECT 1 FROM organizations WHERE lower(slug) = lower($1)', [slug]);
  return rows.length > 0;
}
