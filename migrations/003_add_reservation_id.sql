-- Add reservation_id column for matching events across sources
-- Run this in Supabase SQL Editor

ALTER TABLE ops_raw_events ADD COLUMN IF NOT EXISTS reservation_id TEXT;
CREATE INDEX IF NOT EXISTS idx_raw_events_reservation_id ON ops_raw_events(reservation_id);
