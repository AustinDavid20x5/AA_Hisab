/*
  # Fix Database Setup and Security

  1. Changes
    - Drop all existing objects to start clean
    - Create roles table with proper structure
    - Create profiles table with proper structure
    - Set up RLS policies
    - Create admin role with proper permissions
*/

-- First drop policies that depend on the is_admin function
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles'
        AND policyname = 'Profiles are only accessible through proper authentication'
    ) THEN
        DROP POLICY "Profiles are only accessible through proper authentication" ON profiles;
    END IF;
END $$;

-- Now we can safely drop the functions
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.check_user_creation() CASCADE;
DROP TRIGGER IF EXISTS ensure_admin_creates_user ON auth.users;

-- Ensure UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Recreate roles table
DROP TABLE IF EXISTS roles CASCADE;
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  permissions jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Recreate profiles table
DROP TABLE IF EXISTS profiles CASCADE;
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  full_name text,
  role_id uuid REFERENCES roles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create admin role
INSERT INTO roles (name, permissions)
VALUES (
  'admin',
  jsonb_build_object(
    'users', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'roles', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'profiles', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'all', true
  )
) ON CONFLICT (name) DO UPDATE 
SET permissions = EXCLUDED.permissions;

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = auth.uid()
    AND r.name = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_role_id uuid;
BEGIN
    -- Get the admin role ID if the user is marked as admin
    IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
        SELECT id INTO v_role_id
        FROM roles
        WHERE name = 'admin';
    END IF;

    -- Create a profile for the new user
    INSERT INTO public.profiles (id, full_name, role_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
        v_role_id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user handling
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles'
        AND policyname = 'view_own_profile'
    ) THEN
        CREATE POLICY "view_own_profile"
        ON profiles FOR SELECT
        TO authenticated
        USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles'
        AND policyname = 'update_own_profile'
    ) THEN
        CREATE POLICY "update_own_profile"
        ON profiles FOR UPDATE
        TO authenticated
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles'
        AND policyname = 'admin_full_access'
    ) THEN
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