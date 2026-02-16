-- Add assigned_techs column for storing selected tech staff
ALTER TABLE ops_events ADD COLUMN IF NOT EXISTS assigned_techs TEXT[];
