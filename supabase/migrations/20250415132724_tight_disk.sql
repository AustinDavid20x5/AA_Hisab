/*
  # Fix Profiles RLS Policies

  1. Changes
    - Drop existing policies
    - Create simplified RLS policies for profiles table
    - Fix recursive policy issues
    - Add proper admin access checks
*/

-- Drop existing policies
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "allow_read_for_authenticated_users" ON profiles;
    DROP POLICY IF EXISTS "allow_insert_for_admin" ON profiles;
    DROP POLICY IF EXISTS "allow_update_for_admin_and_self" ON profiles;
    DROP POLICY IF EXISTS "allow_delete_for_admin" ON profiles;
    DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
    DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;
    DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
    DROP POLICY IF EXISTS "profiles_delete_policy" ON profiles;
END $$;

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = user_id AND r.name = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new simplified policies
CREATE POLICY "read_own_profile"
ON profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = id OR is_admin(auth.uid())
);

CREATE POLICY "insert_as_admin"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (
  is_admin(auth.uid())
);

CREATE POLICY "update_own_profile"
ON profiles FOR UPDATE
TO authenticated
USING (
  auth.uid() = id OR is_admin(auth.uid())
)
WITH CHECK (
  auth.uid() = id OR is_admin(auth.uid())
);

CREATE POLICY "delete_as_admin"
ON profiles FOR DELETE
TO authenticated
USING (
  is_admin(auth.uid())
);