-- KARMA Trading Platform — baseline schema
-- Applied in order by apps/api/src/db/migrate.ts. Do not edit a migration
-- once it has run anywhere outside local dev — add a new numbered file instead.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Identity (Clerk owns auth; these tables own authorization + profile data)
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id   TEXT NOT NULL UNIQUE,
  role            TEXT NOT NULL CHECK (role IN ('ADMIN', 'CLIENT')),
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ
);
CREATE INDEX idx_users_clerk_user_id ON users (clerk_user_id);

-- A client row is created by the admin at invite time, BEFORE the invited
-- person has a Clerk account. user_id / clerk_user_id start NULL and are
-- filled in by the Clerk `user.created` webhook once they accept the
-- invitation (matched by lowercased invited_email). Until then the client
-- cannot authenticate — there is no session token that could map to them.
CREATE TABLE clients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  clerk_user_id       TEXT UNIQUE,
  name                TEXT NOT NULL,
  phone               TEXT,
  preferred_broker    TEXT NOT NULL DEFAULT 'ANGEL_ONE' CHECK (preferred_broker IN ('ANGEL_ONE')),
  status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
  invited_email       TEXT NOT NULL,
  invited_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at        TIMESTAMPTZ
);
CREATE INDEX idx_clients_clerk_user_id ON clients (clerk_user_id);
CREATE INDEX idx_clients_status ON clients (status);
CREATE UNIQUE INDEX uniq_clients_invited_email ON clients (lower(invited_email));

CREATE TABLE memberships (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  status                      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')),
  starts_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at                  TIMESTAMPTZ NOT NULL,
  last_payment_marked_at      TIMESTAMPTZ,
  last_payment_marked_by      UUID REFERENCES users (id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_memberships_client_id ON memberships (client_id);
CREATE INDEX idx_memberships_expires_at ON memberships (expires_at);
-- One row per client kept current; history is preserved via updated_at + audit_events,
-- not via multiple membership rows, to keep "is this client entitled right now" a single lookup.
CREATE UNIQUE INDEX uniq_membership_per_client ON memberships (client_id);

CREATE TABLE devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  expo_push_token   TEXT NOT NULL,
  platform          TEXT NOT NULL CHECK (platform IN ('IOS', 'ANDROID')),
  device_name       TEXT,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at    TIMESTAMPTZ
);
CREATE INDEX idx_devices_client_id ON devices (client_id);
CREATE UNIQUE INDEX uniq_active_token ON devices (expo_push_token) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Signals
-- ---------------------------------------------------------------------------

CREATE TABLE signals (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_admin_id       UUID NOT NULL REFERENCES users (id),
  status                    TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
                               'DRAFT','PUBLISHED','ENTRY_HIT','T1_HIT','T2_HIT','T3_HIT',
                               'CANCELLED','EXPIRED','EXITED','CLOSED'
                             )),
  side                      TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  instrument_display_name   TEXT NOT NULL,

  -- trade plan (immutable intent fields duplicated as columns for query/index performance)
  entry                     NUMERIC(18,4) NOT NULL,
  stop_loss                 NUMERIC(18,4) NOT NULL,
  target1                   NUMERIC(18,4) NOT NULL,
  target2                   NUMERIC(18,4),
  target3                   NUMERIC(18,4),
  partial_exit_percentages  JSONB,

  -- broker order hint (Angel One-supported fields ONLY — never store unsupported fields)
  broker                    TEXT NOT NULL DEFAULT 'ANGEL_ONE' CHECK (broker IN ('ANGEL_ONE')),
  exchange                  TEXT NOT NULL,
  trading_symbol            TEXT NOT NULL,
  symbol_token              TEXT,
  order_type                TEXT NOT NULL DEFAULT 'LIMIT' CHECK (order_type IN ('MARKET','LIMIT')),
  product_type              TEXT,
  quantity                  INTEGER,

  notes                     TEXT,
  published_at              TIMESTAMPTZ,
  expires_at                TIMESTAMPTZ,
  closed_at                 TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_signals_status ON signals (status);
CREATE INDEX idx_signals_published_at ON signals (published_at);

-- Immutable event ledger. Rows are NEVER updated or deleted — this is the audit
-- trail for every state transition and the mechanism for idempotent retries.
CREATE TABLE signal_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id             UUID NOT NULL REFERENCES signals (id) ON DELETE CASCADE,
  event_type            TEXT NOT NULL,
  payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_admin_id   UUID NOT NULL REFERENCES users (id),
  idempotency_key       UUID NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_signal_events_signal_id ON signal_events (signal_id, created_at);
-- The same idempotency key must never be applied twice to the same signal.
CREATE UNIQUE INDEX uniq_signal_event_idempotency ON signal_events (signal_id, idempotency_key);

-- Recipient set is frozen at publish time (snapshot of clients with ACTIVE
-- membership + ACTIVE status). Later membership changes do not retroactively
-- add/remove access to a signal already published — see docs/decisions.md.
CREATE TABLE signal_recipients (
  signal_id    UUID NOT NULL REFERENCES signals (id) ON DELETE CASCADE,
  client_id    UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (signal_id, client_id)
);
CREATE INDEX idx_signal_recipients_client_id ON signal_recipients (client_id);

-- ---------------------------------------------------------------------------
-- Notifications (BullMQ enqueues from this table's rows; worker updates status)
-- ---------------------------------------------------------------------------

CREATE TABLE notification_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id      UUID NOT NULL REFERENCES signals (id) ON DELETE CASCADE,
  client_id      UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  device_id      UUID NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  event_type     TEXT NOT NULL,
  priority       TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'CRITICAL')),
  status         TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED','DEAD_LETTER')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at        TIMESTAMPTZ
);
CREATE INDEX idx_notification_jobs_status ON notification_jobs (status);
CREATE INDEX idx_notification_jobs_signal_id ON notification_jobs (signal_id);

-- ---------------------------------------------------------------------------
-- Audit (separate from signal_events — covers admin/client/membership actions)
-- ---------------------------------------------------------------------------

CREATE TABLE audit_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id    UUID REFERENCES users (id),
  action            TEXT NOT NULL,
  target_type       TEXT NOT NULL,
  target_id         TEXT NOT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_events_target ON audit_events (target_type, target_id);
CREATE INDEX idx_audit_events_created_at ON audit_events (created_at);

COMMIT;
