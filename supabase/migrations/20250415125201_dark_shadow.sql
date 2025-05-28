/*
  # Fix Profile Access and Admin Setup

  1. Security Updates
    - Simplify RLS policies for better access control
    - Ensure admin role has proper permissions
    - Fix profile access for authenticated users

  2. Changes
    - Drop existing complex policies
    - Create new streamlined policies
    - Update admin role permissions
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON profiles;
DROP POLICY IF EXISTS "Enable update for users and admins" ON profiles;
DROP POLICY IF EXISTS "Enable insert for admins" ON profiles;
DROP POLICY IF EXISTS "Enable delete for admins" ON profiles;

-- Ensure roles table has RLS disabled
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;

-- Update admin role permissions
UPDATE roles
SET permissions = jsonb_build_object(
  'users', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'roles', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'profiles', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'all', true
)
WHERE name = 'admin';

-- Create simplified policies for profiles
CREATE POLICY "Allow authenticated users to read profiles"
ON profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow users to update own profile and admins to update all"
ON profiles FOR UPDATE
TO authenticated
USING (
  auth.uid() = id OR 
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = auth.uid() AND r.name = 'admin'
  )
)
WITH CHECK (
  auth.uid() = id OR 
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = auth.uid() AND r.name = 'admin'
  )
);

CREATE POLICY "Allow admins to insert profiles"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = auth.uid() AND r.name = 'admin'
  )
);

CREATE POLICY "Allow admins to delete profiles"
ON profiles FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = auth.uid() AND r.name = 'admin'
  )
);