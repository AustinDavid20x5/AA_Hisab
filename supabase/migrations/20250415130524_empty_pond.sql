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
        DROP POLICY IF EXISTS "Allow admin full access" ON profiles;
        DROP POLICY IF EXISTS "View own profile" ON profiles;
        DROP POLICY IF EXISTS "Update own profile" ON profiles;
        DROP POLICY IF EXISTS "Allow full access for admin users" ON profiles;
        DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
        DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
    END IF;
END $$;

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

-- Update admin role permissions
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

-- Re-enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create new policies with existence checks
DO $$ 
BEGIN
    -- Only create policies if they don't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'admin_full_access_policy'
    ) THEN
        CREATE POLICY "admin_full_access_policy"
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

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'view_own_profile_policy'
    ) THEN
        CREATE POLICY "view_own_profile_policy"
        ON profiles FOR SELECT
        TO authenticated
        USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'update_own_profile_policy'
    ) THEN
        CREATE POLICY "update_own_profile_policy"
        ON profiles FOR UPDATE
        TO authenticated
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id);
    END IF;
END $$;