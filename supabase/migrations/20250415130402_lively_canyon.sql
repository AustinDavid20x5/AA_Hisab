/*
  # Fix Profile Access and Policies

  1. Changes
    - Drop all existing policies safely
    - Update admin role permissions
    - Create new simplified policies
    - Add existence checks for policies
*/

-- Disable RLS temporarily
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies to avoid conflicts
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON profiles;
        DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
        DROP POLICY IF EXISTS "Admins have full access" ON profiles;
        DROP POLICY IF EXISTS "Allow authenticated users to read profiles" ON profiles;
        DROP POLICY IF EXISTS "Allow users to update own profile and admins to update all" ON profiles;
        DROP POLICY IF EXISTS "Allow admins to insert profiles" ON profiles;
        DROP POLICY IF EXISTS "Allow admins to delete profiles" ON profiles;
    END IF;
END $$;

-- Ensure admin role exists with correct permissions
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

-- Re-enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create new simplified policies with existence checks
DO $$ 
BEGIN
    -- Only create policies if they don't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'profiles_viewable_by_authenticated_users'
    ) THEN
        CREATE POLICY "profiles_viewable_by_authenticated_users"
        ON profiles FOR SELECT
        TO authenticated
        USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'profiles_update_own'
    ) THEN
        CREATE POLICY "profiles_update_own"
        ON profiles FOR UPDATE
        TO authenticated
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'profiles_admin_full_access'
    ) THEN
        CREATE POLICY "profiles_admin_full_access"
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