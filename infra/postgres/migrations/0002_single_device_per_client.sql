-- One active mobile device/session per CLIENT ACCOUNT (not platform-wide).
-- A partial unique index on client_id WHERE revoked_at IS NULL means
-- Postgres itself rejects a second concurrently-active device row for the
-- same client — this is what makes the "new login wins" flow race-safe
-- under concurrent requests, not just correct in the common case.

BEGIN;

DROP INDEX IF EXISTS uniq_active_token;

ALTER TABLE devices ADD COLUMN clerk_session_id TEXT;

CREATE UNIQUE INDEX uniq_one_active_device_per_client ON devices (client_id) WHERE revoked_at IS NULL;

COMMIT;
