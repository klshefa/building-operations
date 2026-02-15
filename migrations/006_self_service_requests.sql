-- Migration: Add fields for self-service event requests
-- Run this in Supabase SQL Editor

-- Add columns to ops_events for tracking user requests
ALTER TABLE ops_events 
ADD COLUMN IF NOT EXISTS requested_by TEXT,
ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS veracross_reservation_id TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add index for querying user's events
CREATE INDEX IF NOT EXISTS idx_ops_events_requested_by ON ops_events(requested_by);

-- Add index for status
CREATE INDEX IF NOT EXISTS idx_ops_events_status ON ops_events(status);

-- Add check constraint for status values
ALTER TABLE ops_events 
ADD CONSTRAINT chk_status CHECK (status IN ('active', 'cancelled'));

-- Comment on columns
COMMENT ON COLUMN ops_events.requested_by IS 'Email of user who requested this event via self-service form';
COMMENT ON COLUMN ops_events.requested_at IS 'Timestamp when event was requested';
COMMENT ON COLUMN ops_events.veracross_reservation_id IS 'Reservation ID returned from Veracross API';
COMMENT ON COLUMN ops_events.status IS 'Event status: active or cancelled';
