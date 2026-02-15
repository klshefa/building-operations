image.png-- Event mentions table for tracking @mentions in notes
-- This allows us to:
-- 1. Avoid sending duplicate Slack notifications
-- 2. Track who mentioned who and when
-- 3. Display mention history in the UI

CREATE TABLE IF NOT EXISTS event_mentions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES ops_events(id) ON DELETE CASCADE,
  note_type VARCHAR(50) NOT NULL, -- 'general', 'program', 'office', 'it', 'security', 'facilities'
  mentioned_email VARCHAR(255) NOT NULL,
  mentioned_by VARCHAR(255) NOT NULL,
  slack_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate mentions in the same note type
  UNIQUE(event_id, note_type, mentioned_email)
);

-- Index for fast lookups by event
CREATE INDEX IF NOT EXISTS idx_event_mentions_event_id ON event_mentions(event_id);

-- Index for lookups by mentioned user
CREATE INDEX IF NOT EXISTS idx_event_mentions_mentioned_email ON event_mentions(mentioned_email);

-- RLS policies
ALTER TABLE event_mentions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read mentions
CREATE POLICY "Allow authenticated read" ON event_mentions
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert mentions
CREATE POLICY "Allow authenticated insert" ON event_mentions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Comment on table
COMMENT ON TABLE event_mentions IS 'Tracks @mentions in event notes for Slack notifications';
COMMENT ON COLUMN event_mentions.note_type IS 'Which notes field: general, program, office, it, security, facilities';
COMMENT ON COLUMN event_mentions.slack_sent IS 'Whether Slack notification was successfully sent';
