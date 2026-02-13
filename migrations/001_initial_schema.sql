-- Building Operations Portal - Initial Schema
-- Run this in Supabase SQL Editor

-- ==========================================
-- RESOURCES TABLE (from BigQuery sync)
-- ==========================================
CREATE TABLE IF NOT EXISTS ops_resources (
  id INTEGER PRIMARY KEY,
  resource_type TEXT,
  description TEXT NOT NULL,
  abbreviation TEXT,
  capacity INTEGER,
  responsible_person TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- RAW EVENTS TABLE (synced from sources)
-- ==========================================
CREATE TABLE IF NOT EXISTS ops_raw_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('bigquery_group', 'bigquery_resource', 'calendar_staff', 'calendar_ls', 'calendar_ms', 'manual')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  start_time TEXT,
  end_time TEXT,
  location TEXT,
  resource TEXT,
  contact_person TEXT,
  recurring_pattern TEXT,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_raw_events_date ON ops_raw_events(start_date);
CREATE INDEX IF NOT EXISTS idx_raw_events_source ON ops_raw_events(source);

-- ==========================================
-- MAIN EVENTS TABLE (aggregated/matched)
-- ==========================================
CREATE TABLE IF NOT EXISTS ops_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  start_time TEXT,
  end_time TEXT,
  all_day BOOLEAN DEFAULT FALSE,
  location TEXT,
  resource_id INTEGER REFERENCES ops_resources(id),
  event_type TEXT DEFAULT 'other' CHECK (event_type IN (
    'program_event', 'meeting', 'assembly', 'field_trip', 'performance',
    'athletic', 'parent_event', 'professional_development', 'religious_observance',
    'fundraiser', 'other'
  )),
  
  -- General info
  expected_attendees INTEGER,
  food_served BOOLEAN DEFAULT FALSE,
  food_provider TEXT,
  
  -- Team assignments
  needs_program_director BOOLEAN DEFAULT FALSE,
  needs_office BOOLEAN DEFAULT FALSE,
  needs_it BOOLEAN DEFAULT FALSE,
  needs_security BOOLEAN DEFAULT FALSE,
  needs_facilities BOOLEAN DEFAULT FALSE,
  
  -- Team notes
  program_director_notes TEXT,
  office_notes TEXT,
  it_notes TEXT,
  security_notes TEXT,
  facilities_notes TEXT,
  
  -- Facilities specifics
  setup_instructions TEXT,
  
  -- Security specifics
  security_personnel_needed INTEGER,
  building_open BOOLEAN DEFAULT FALSE,
  elevator_notes TEXT,
  
  -- IT specifics
  techs_needed INTEGER,
  av_equipment TEXT,
  tech_notes TEXT,
  
  -- Status
  is_hidden BOOLEAN DEFAULT FALSE,
  has_conflict BOOLEAN DEFAULT FALSE,
  conflict_ok BOOLEAN DEFAULT FALSE,
  conflict_notes TEXT,
  
  -- Source tracking
  source_events UUID[] DEFAULT '{}',
  primary_source TEXT NOT NULL CHECK (primary_source IN ('bigquery_group', 'bigquery_resource', 'calendar_staff', 'calendar_ls', 'calendar_ms', 'manual')),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_date ON ops_events(start_date);
CREATE INDEX IF NOT EXISTS idx_events_hidden ON ops_events(is_hidden);
CREATE INDEX IF NOT EXISTS idx_events_conflict ON ops_events(has_conflict);

-- ==========================================
-- EVENT MATCHES TABLE (for source matching)
-- ==========================================
CREATE TABLE IF NOT EXISTS ops_event_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES ops_events(id) ON DELETE CASCADE,
  raw_event_id UUID REFERENCES ops_raw_events(id) ON DELETE CASCADE,
  match_type TEXT NOT NULL CHECK (match_type IN ('auto', 'manual')),
  match_confidence DECIMAL(3,2) DEFAULT 1.0,
  matched_at TIMESTAMPTZ DEFAULT NOW(),
  matched_by TEXT,
  UNIQUE(event_id, raw_event_id)
);

-- ==========================================
-- CONFLICTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS ops_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_a_id UUID REFERENCES ops_events(id) ON DELETE CASCADE,
  event_b_id UUID REFERENCES ops_events(id) ON DELETE CASCADE,
  conflict_type TEXT NOT NULL CHECK (conflict_type IN ('time_overlap', 'resource_conflict', 'personnel_conflict')),
  is_resolved BOOLEAN DEFAULT FALSE,
  resolution_notes TEXT,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conflicts_unresolved ON ops_conflicts(is_resolved) WHERE NOT is_resolved;

-- ==========================================
-- USERS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS ops_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'program_director', 'office', 'it', 'security', 'facilities', 'viewer')),
  teams TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_users_email ON ops_users(email);
CREATE INDEX IF NOT EXISTS idx_ops_users_active ON ops_users(is_active);

-- ==========================================
-- CALENDAR SYNC METADATA
-- ==========================================
CREATE TABLE IF NOT EXISTS ops_calendar_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id TEXT NOT NULL UNIQUE,
  calendar_name TEXT NOT NULL,
  last_sync TIMESTAMPTZ,
  next_sync_token TEXT,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- SYNC LOG
-- ==========================================
CREATE TABLE IF NOT EXISTS ops_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  events_synced INTEGER DEFAULT 0,
  events_matched INTEGER DEFAULT 0,
  errors TEXT[],
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed'))
);

-- ==========================================
-- ROW LEVEL SECURITY
-- ==========================================
ALTER TABLE ops_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_raw_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_event_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_calendar_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_sync_log ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "ops_users_select" ON ops_users
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ops_users_manage" ON ops_users
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ops_users
      WHERE email = auth.jwt()->>'email'
      AND role = 'admin'
    )
  );

-- Events table policies - everyone with access can view and edit
CREATE POLICY "ops_events_select" ON ops_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ops_users
      WHERE email = auth.jwt()->>'email'
      AND is_active = true
    )
  );

CREATE POLICY "ops_events_manage" ON ops_events
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ops_users
      WHERE email = auth.jwt()->>'email'
      AND is_active = true
    )
  );

-- Resources - read only for users
CREATE POLICY "ops_resources_select" ON ops_resources
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ops_users
      WHERE email = auth.jwt()->>'email'
      AND is_active = true
    )
  );

-- Raw events - read only for users
CREATE POLICY "ops_raw_events_select" ON ops_raw_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ops_users
      WHERE email = auth.jwt()->>'email'
      AND is_active = true
    )
  );

-- Conflicts - all users can view and manage
CREATE POLICY "ops_conflicts_select" ON ops_conflicts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ops_users
      WHERE email = auth.jwt()->>'email'
      AND is_active = true
    )
  );

CREATE POLICY "ops_conflicts_manage" ON ops_conflicts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ops_users
      WHERE email = auth.jwt()->>'email'
      AND is_active = true
    )
  );

-- Event matches - all users can manage
CREATE POLICY "ops_event_matches_all" ON ops_event_matches
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ops_users
      WHERE email = auth.jwt()->>'email'
      AND is_active = true
    )
  );

-- Calendar sync - admin only
CREATE POLICY "ops_calendar_sync_admin" ON ops_calendar_sync
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ops_users
      WHERE email = auth.jwt()->>'email'
      AND role = 'admin'
    )
  );

-- Sync log - admin only
CREATE POLICY "ops_sync_log_admin" ON ops_sync_log
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ops_users
      WHERE email = auth.jwt()->>'email'
      AND role = 'admin'
    )
  );

-- ==========================================
-- INITIAL DATA
-- ==========================================

-- Add calendar sync entries
INSERT INTO ops_calendar_sync (calendar_id, calendar_name)
VALUES 
  ('shefaschool.org_jhs622n7onu1itim84h5ch41to@group.calendar.google.com', 'Staff Calendar'),
  ('c_ll3pn34b3vul3a08qrqq6vn00g@group.calendar.google.com', 'Lower School Calendar'),
  ('c_vk1n1cdvov22evuq77t4cehn68@group.calendar.google.com', 'Middle School Calendar')
ON CONFLICT (calendar_id) DO NOTHING;

-- Add initial admin user (replace with actual email)
-- INSERT INTO ops_users (email, name, role, teams)
-- VALUES ('keith.lowry@shefaschool.org', 'Keith Lowry', 'admin', ARRAY['it']);
