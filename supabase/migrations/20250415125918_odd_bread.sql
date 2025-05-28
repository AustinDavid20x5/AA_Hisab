/*
  # Fix Profile Access and Policies

  1. Changes
    - Drop existing policies safely
    - Update admin role permissions
    - Create new simplified policies
*/

-- Disable RLS on roles table to ensure it's accessible
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;

-- Disable RLS temporarily on profiles to allow initial setup
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DO $$ 
BEGIN
    -- Drop policies if they exist
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
        DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
        DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
        DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
        DROP POLICY IF EXISTS "Allow full access for admin users" ON profiles;
        DROP POLICY IF EXISTS "Profiles are viewable by users and admins" ON profiles;
        DROP POLICY IF EXISTS "Profiles are updatable by users and admins" ON profiles;
        DROP POLICY IF EXISTS "Profiles can be inserted by admins" ON profiles;
        DROP POLICY IF EXISTS "Allow users to view their own profile" ON profiles;
        DROP POLICY IF EXISTS "Allow users to update their own profile" ON profiles;
        DROP POLICY IF EXISTS "Allow admins full access to profiles" ON profiles;
    END IF;
END $$;

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
DO $$ 
BEGIN
    -- Only create policies if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'view_own_profile') THEN
        CREATE POLICY "view_own_profile"
        ON profiles FOR SELECT
        TO authenticated
        USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'update_own_profile') THEN
        CREATE POLICY "update_own_profile"
        ON profiles FOR UPDATE
        TO authenticated
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'admin_full_access') THEN
        CREATE POLICY "admin_full_access"
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
    END IF;
END $$;