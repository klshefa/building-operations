-- Fix ops_users RLS to match event_tracker_users pattern
-- Drop existing policies
DROP POLICY IF EXISTS "ops_users_select" ON ops_users;
DROP POLICY IF EXISTS "ops_users_manage" ON ops_users;

-- Create simple policy matching event_tracker_users pattern
-- Allow users to read their own record
CREATE POLICY "Users can read own record" ON ops_users
  FOR SELECT
  USING (auth.jwt() ->> 'email' = email);

-- Allow admins to manage all records  
CREATE POLICY "Admins can manage all" ON ops_users
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM ops_users
      WHERE email = auth.jwt() ->> 'email'
      AND role = 'admin'
    )
  );

-- Grant select to authenticated users
GRANT SELECT ON ops_users TO authenticated;
