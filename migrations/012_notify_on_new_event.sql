-- Add notify_on_new_event preference to ops_users
-- Admin-controlled: when true, user receives an email whenever a manual event is created
ALTER TABLE public.ops_users
  ADD COLUMN IF NOT EXISTS notify_on_new_event BOOLEAN DEFAULT FALSE;
