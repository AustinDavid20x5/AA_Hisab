-- Disable RLS on roles table to ensure it's accessible
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;

-- Disable RLS temporarily on profiles to allow initial setup
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Allow full access for admin users" ON profiles;
DROP POLICY IF EXISTS "Profiles are viewable by users and admins" ON profiles;
DROP POLICY IF EXISTS "Profiles are updatable by users and admins" ON profiles;
DROP POLICY IF EXISTS "Profiles can be inserted by admins" ON profiles;

-- Create or update admin role
INSERT INTO roles (name, permissions)
VALUES (
  'admin',
  jsonb_build_object(
    'users', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'roles', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'profiles', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'all', true
  )
)
ON CONFLICT (name) 
DO UPDATE SET permissions = EXCLUDED.permissions;

-- Re-enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create new policies for profiles
CREATE POLICY "Allow users to view their own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Allow users to update their own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow admins full access to profiles"
ON profiles FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = auth.uid() AND r.name = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = auth.uid() AND r.name = 'admin'
  )
);