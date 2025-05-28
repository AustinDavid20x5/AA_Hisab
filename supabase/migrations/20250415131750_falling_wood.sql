/*
  # Fix Profile Policies
  
  1. Changes
    - Drop existing policies
    - Create new simplified policies with proper UUID handling
    - Fix role check logic
*/

-- Drop all existing policies
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "admin_can_manage_all_profiles" ON profiles;
    DROP POLICY IF EXISTS "users_can_read_own_profile" ON profiles;
    DROP POLICY IF EXISTS "users_can_update_own_profile" ON profiles;
    DROP POLICY IF EXISTS "enable_read_access_for_all_authenticated_users" ON profiles;
    DROP POLICY IF EXISTS "enable_insert_for_admin" ON profiles;
    DROP POLICY IF EXISTS "enable_update_for_own_profile_and_admin" ON profiles;
    DROP POLICY IF EXISTS "enable_delete_for_admin" ON profiles;
END $$;

-- Disable RLS temporarily
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Create new simplified policies
CREATE POLICY "profiles_select_policy"
ON profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "profiles_insert_policy"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = auth.uid()
    AND r.name = 'admin'
  )
);

CREATE POLICY "profiles_update_policy"
ON profiles FOR UPDATE
TO authenticated
USING (
  auth.uid() = id OR
  EXISTS (
    SELECT 1
    FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = auth.uid()
    AND r.name = 'admin'
  )
)
WITH CHECK (
  auth.uid() = id OR
  EXISTS (
    SELECT 1
    FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = auth.uid()
    AND r.name = 'admin'
  )
);

CREATE POLICY "profiles_delete_policy"
ON profiles FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = auth.uid()
    AND r.name = 'admin'
  )
);

-- Re-enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;