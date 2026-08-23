-- Fast lookup for the per-client one-device session guard.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_devices_clerk_session_id ON devices (clerk_session_id);
COMMIT;
