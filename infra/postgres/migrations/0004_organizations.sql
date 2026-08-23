-- KARMA Trading Platform — organizations + multi-tenant scoping
-- Migration 0004: adds the organizations table and org_id FK columns to
-- clients, signals, and audit_events. Existing data is migrated to a single
-- default organization owned by the first ADMIN user.
--
-- Applied by: apps/api/src/db/migrate.ts
-- Safe to run on an empty database or on an existing single-org database.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Organizations table
-- ---------------------------------------------------------------------------

CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_org_slug ON organizations (lower(slug));
CREATE INDEX idx_org_owner ON organizations (owner_user_id);

-- ---------------------------------------------------------------------------
-- 2. Add org_id to clients, signals, audit_events
--    Nullable first so we can back-fill existing rows before enforcing NOT NULL.
-- ---------------------------------------------------------------------------

ALTER TABLE clients       ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE signals       ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE audit_events  ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

-- Performance indexes for org-scoped queries
CREATE INDEX idx_clients_org_id   ON clients   (org_id);
CREATE INDEX idx_signals_org_id   ON signals   (org_id);
CREATE INDEX idx_audit_org_id     ON audit_events (org_id);

-- ---------------------------------------------------------------------------
-- 3. Back-fill: if any ADMIN users exist, create a default org and assign all
--    existing clients/signals to it. On a fresh database this is a no-op.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_admin_user_id   UUID;
  v_org_id          UUID;
BEGIN
  -- Find the first admin user (by creation time)
  SELECT id INTO v_admin_user_id
  FROM users
  WHERE role = 'ADMIN'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_admin_user_id IS NOT NULL THEN
    -- Create a default organization for the existing admin
    INSERT INTO organizations (name, slug, owner_user_id)
    VALUES ('My Organization', 'my-organization', v_admin_user_id)
    RETURNING id INTO v_org_id;

    -- Assign all existing clients and signals to this default org
    UPDATE clients SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE signals SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE audit_events SET org_id = v_org_id WHERE org_id IS NULL;

    RAISE NOTICE 'Backfilled existing data to org %', v_org_id;
  ELSE
    RAISE NOTICE 'No existing admin users — skipping backfill (fresh database)';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 4. Also add org_id to the users table so admins can be linked to their org
--    (clients are linked via the clients table, but the admin user needs this
--    for fast RBAC lookups without joining through organizations).
-- ---------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
CREATE INDEX idx_users_org_id ON users (org_id);

-- Back-fill admin users to the default org if it exists
DO $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT id INTO v_org_id FROM organizations ORDER BY created_at ASC LIMIT 1;
  IF v_org_id IS NOT NULL THEN
    UPDATE users SET org_id = v_org_id WHERE role = 'ADMIN' AND org_id IS NULL;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 5. Now enforce NOT NULL on clients and signals (audit_events stays nullable
--    for system-level events that aren't org-specific).
--    Only enforce if the backfill above succeeded (i.e., no NULLs remain).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  null_clients INTEGER;
  null_signals INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_clients FROM clients WHERE org_id IS NULL;
  SELECT COUNT(*) INTO null_signals FROM signals WHERE org_id IS NULL;

  IF null_clients = 0 THEN
    ALTER TABLE clients ALTER COLUMN org_id SET NOT NULL;
    RAISE NOTICE 'clients.org_id set NOT NULL';
  ELSE
    RAISE WARNING 'clients.org_id NOT NULL skipped — % rows still NULL. Run backfill manually.', null_clients;
  END IF;

  IF null_signals = 0 THEN
    ALTER TABLE signals ALTER COLUMN org_id SET NOT NULL;
    RAISE NOTICE 'signals.org_id set NOT NULL';
  ELSE
    RAISE WARNING 'signals.org_id NOT NULL skipped — % rows still NULL. Run backfill manually.', null_signals;
  END IF;
END$$;

COMMIT;
