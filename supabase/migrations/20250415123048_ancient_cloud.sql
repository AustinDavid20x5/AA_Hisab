-- First ensure the roles table has RLS disabled (it should be accessible)
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;

-- Ensure admin role exists
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
DO UPDATE SET permissions = EXCLUDED.permissions
RETURNING id;

-- Disable RLS temporarily to allow initial setup
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Create function to ensure admin role exists
CREATE OR REPLACE FUNCTION get_admin_role_id()
RETURNS uuid AS $$
DECLARE
  admin_role_id uuid;
BEGIN
  SELECT id INTO admin_role_id FROM roles WHERE name = 'admin' LIMIT 1;
  RETURN admin_role_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create or update the handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_role_id uuid;
BEGIN
    -- Get the admin role ID if the user is marked as admin
    IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
        SELECT get_admin_role_id() INTO v_role_id;
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

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Re-enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Update profile policies
CREATE POLICY "Profiles are viewable by users and admins"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id OR 
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name = 'admin'
    )
  );

CREATE POLICY "Profiles are updatable by users and admins"
  ON profiles
  FOR UPDATE
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

CREATE POLICY "Profiles can be inserted by admins"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name = 'admin'
    )
  );