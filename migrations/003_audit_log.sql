-- Audit log table for tracking all changes in Building Operations
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS ops_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What was changed
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'ops_events',
    'ops_raw_events', 
    'ops_users',
    'ops_event_filters',
    'ops_event_matches',
    'ops_resources',
    'event_subscriptions'
  )),
  entity_id TEXT NOT NULL,
  
  -- Action taken
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'BULK_UPDATE')),
  
  -- Who made the change
  user_email TEXT,
  
  -- What changed
  changed_fields JSONB,
  old_values JSONB,
  new_values JSONB,
  
  -- Context
  api_route TEXT,
  http_method TEXT,
  metadata JSONB,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_entity ON ops_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON ops_audit_log(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_action ON ops_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON ops_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON ops_audit_log(entity_type);

-- Comment for documentation
COMMENT ON TABLE ops_audit_log IS 'Tracks all changes made in Building Operations for auditing and compliance';
