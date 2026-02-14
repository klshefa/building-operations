-- Event subscriptions table for notification system
CREATE TABLE IF NOT EXISTS event_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES ops_events(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  user_name TEXT,
  subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint: one subscription per user per event
  UNIQUE(event_id, user_email)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_event_subscriptions_event ON event_subscriptions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_subscriptions_user ON event_subscriptions(user_email);

-- Add notification preferences to ops_users
ALTER TABLE ops_users ADD COLUMN IF NOT EXISTS notify_on_team_assignment BOOLEAN DEFAULT TRUE;
ALTER TABLE ops_users ADD COLUMN IF NOT EXISTS notify_on_subscribed_changes BOOLEAN DEFAULT TRUE;

-- Enable RLS
ALTER TABLE event_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own subscriptions
CREATE POLICY "Users can view their subscriptions" ON event_subscriptions
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their subscriptions" ON event_subscriptions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete their subscriptions" ON event_subscriptions
  FOR DELETE USING (true);
