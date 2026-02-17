-- Add recurring_pattern column to ops_events for filtering recurring classes
ALTER TABLE ops_events ADD COLUMN IF NOT EXISTS recurring_pattern TEXT;
COMMENT ON COLUMN ops_events.recurring_pattern IS 'Days pattern from BigQuery (e.g., "MWF") for recurring events like classes';
