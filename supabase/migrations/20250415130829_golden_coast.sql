/*
  # Fix profiles table RLS policies

  1. Changes
    - Drop existing policies that may be causing recursion
    - Create new, simplified policies for profiles table:
      - Admin users can access all profiles
      - Regular users can only access their own profile
      - All authenticated users can view their own profile

  2. Security
    - Maintains RLS on profiles table
    - Adds clear, non-recursive policies
*/

-- First, drop existing policies to start fresh
DROP POLICY IF EXISTS "admin_full_access" ON profiles;
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
DROP POLICY IF EXISTS "view_own_profile" ON profiles;

-- Create new policies without recursion
CREATE POLICY "admin_can_manage_all_profiles"
ON profiles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM roles r
    WHERE r.id = auth.uid() 
    AND r.name = 'admin'
  )
);

CREATE POLICY "users_can_read_own_profile"
ON profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "users_can_update_own_profile"
ON profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);