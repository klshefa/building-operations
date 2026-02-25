-- Add resource_id to ops_raw_events so BigQuery reservation sync can store
-- the integer Resource_ID that maps to ops_resources.id.
-- Previously only the resource NAME was captured, leaving ops_events with
-- NULL resource_id after aggregation and forcing loose fuzzy matching.

ALTER TABLE ops_raw_events
  ADD COLUMN IF NOT EXISTS resource_id INTEGER REFERENCES ops_resources(id);

CREATE INDEX IF NOT EXISTS idx_raw_events_resource_id
  ON ops_raw_events(resource_id);
