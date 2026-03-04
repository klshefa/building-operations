-- Add calendar_maintenance and calendar_admissions as valid source types

-- Drop and recreate CHECK constraints to include new sources
ALTER TABLE ops_raw_events DROP CONSTRAINT IF EXISTS ops_raw_events_source_check;
ALTER TABLE ops_raw_events ADD CONSTRAINT ops_raw_events_source_check
  CHECK (source IN ('bigquery_group', 'bigquery_resource', 'calendar_staff', 'calendar_ls', 'calendar_ms', 'calendar_maintenance', 'calendar_admissions', 'manual'));

ALTER TABLE ops_events DROP CONSTRAINT IF EXISTS ops_events_primary_source_check;
ALTER TABLE ops_events ADD CONSTRAINT ops_events_primary_source_check
  CHECK (primary_source IN ('bigquery_group', 'bigquery_resource', 'calendar_staff', 'calendar_ls', 'calendar_ms', 'calendar_maintenance', 'calendar_admissions', 'manual'));

-- Seed ops_calendar_sync so sync status tracking works for the new calendars
INSERT INTO ops_calendar_sync (calendar_id, calendar_name, last_sync, error_count, last_error)
VALUES
  ('c_f3a382bed8047ea9c4752c76b00336e7d484d88567928b7777e72c820f3cdbc8@group.calendar.google.com', 'Maintenance Setups', NULL, 0, NULL),
  ('n7eelka44qs2fq2ke1r34e3ejk@group.calendar.google.com', 'Admissions Events', NULL, 0, NULL)
ON CONFLICT (calendar_id) DO NOTHING;
