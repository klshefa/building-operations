-- Phase 2: Track when an admin approves teams for a self-service event request.
-- Deploy this migration BEFORE enabling the approval UI.
ALTER TABLE ops_events
ADD COLUMN IF NOT EXISTS teams_approved_at TIMESTAMPTZ DEFAULT NULL;
