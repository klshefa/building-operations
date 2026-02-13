-- Event Filters - Auto-hide events based on rules
-- Run this in Supabase SQL Editor

-- ==========================================
-- EVENT FILTERS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS ops_event_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  filter_type TEXT NOT NULL CHECK (filter_type IN (
    'title_contains',
    'title_equals',
    'description_contains',
    'location_contains',
    'location_equals'
  )),
  filter_value TEXT NOT NULL,
  case_sensitive BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_filters_active ON ops_event_filters(is_active);

-- RLS for filters table (admin only can manage, all can view)
ALTER TABLE ops_event_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_event_filters_select" ON ops_event_filters
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ops_event_filters_manage" ON ops_event_filters
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ops_users
      WHERE email = auth.jwt()->>'email'
      AND role = 'admin'
    )
  );

-- Insert some default filters
INSERT INTO ops_event_filters (name, filter_type, filter_value, created_by)
VALUES 
  ('Hide Lunch events', 'title_contains', 'Lunch', 'system'),
  ('Hide Recess events', 'title_contains', 'Recess', 'system'),
  ('Hide Ulam in use', 'title_contains', 'Ulam in use', 'system')
ON CONFLICT DO NOTHING;
