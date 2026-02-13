-- Disable RLS on ops_users to match enrollment_admins pattern
ALTER TABLE ops_users DISABLE ROW LEVEL SECURITY;
