/*
  # Setup User Management and Admin Access

  1. Changes
    - Create function for handling new user creation
    - Set up trigger for automatic profile creation
    - Update admin role permissions
    - Configure RLS policies for profiles
*/

-- Create a function to handle new user creation
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

-- Create a trigger to automatically create profiles for new users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update admin role permissions if they exist
UPDATE roles
SET permissions = jsonb_build_object(
    'users', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'roles', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'profiles', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'categories', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'subcategories', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'chart_of_accounts', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'currencies', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'transaction_types', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'gl_headers', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
    'gl_transactions', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true)
)
WHERE name = 'admin';

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow full access for admin users" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Create new policies for profile access
CREATE POLICY "Allow admin full access"
    ON public.profiles
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            JOIN public.roles r ON p.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            JOIN public.roles r ON p.role_id = r.id
            WHERE p.id = auth.uid()
            AND r.name = 'admin'
        )
    );

-- Add policy for users to view their own profile
CREATE POLICY "View own profile"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Add policy for users to update their own profile
CREATE POLICY "Update own profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);