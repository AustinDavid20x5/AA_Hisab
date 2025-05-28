/*
  # Fix Authentication Setup

  1. Changes
    - Drop existing triggers and policies to avoid conflicts
    - Create admin role with correct permissions
    - Set up user creation trigger
    - Create necessary RLS policies
*/

-- Drop existing triggers and policies to avoid conflicts
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Allow full access for admin users" ON profiles;

-- Ensure admin role exists with correct permissions
INSERT INTO roles (name, permissions)
VALUES (
  'admin',
  '{
    "users": {"create": true, "read": true, "update": true, "delete": true},
    "roles": {"create": true, "read": true, "update": true, "delete": true},
    "profiles": {"create": true, "read": true, "update": true, "delete": true},
    "categories": {"create": true, "read": true, "update": true, "delete": true},
    "subcategories": {"create": true, "read": true, "update": true, "delete": true},
    "chart_of_accounts": {"create": true, "read": true, "update": true, "delete": true},
    "currencies": {"create": true, "read": true, "update": true, "delete": true},
    "transaction_types": {"create": true, "read": true, "update": true, "delete": true},
    "gl_headers": {"create": true, "read": true, "update": true, "delete": true},
    "gl_transactions": {"create": true, "read": true, "update": true, "delete": true}
  }'::jsonb
)
ON CONFLICT (name) 
DO UPDATE SET permissions = EXCLUDED.permissions;

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

-- Create trigger for automatic profile creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create basic policies for all authenticated users
CREATE POLICY "Users can view their own profile"
    ON profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Create admin-specific policies
CREATE POLICY "Admins can view all profiles"
    ON profiles
    FOR SELECT
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

CREATE POLICY "Admins can update all profiles"
    ON profiles
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM profiles p
            JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM profiles p
            JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name = 'admin'
        )
    );

-- Create policy for admin insert permissions
CREATE POLICY "Admins can insert profiles"
    ON profiles
    FOR INSERT
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

-- Create policy for admin delete permissions
CREATE POLICY "Admins can delete profiles"
    ON profiles
    FOR DELETE
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