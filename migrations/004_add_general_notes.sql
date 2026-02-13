-- Add general_notes column to ops_events table
ALTER TABLE ops_events ADD COLUMN IF NOT EXISTS general_notes TEXT;
