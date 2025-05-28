/*
  # Fix User Management and Security

  1. Changes
    - Update admin role permissions
    - Configure secure access policies for profiles
    - Set up proper authentication checks
*/

-- Update admin role permissions
UPDATE roles
SET permissions = jsonb_build_object(
  'users', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'roles', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'profiles', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'all', true
)
WHERE name = 'admin';

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
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

-- Ensure only admin can create new users
CREATE OR REPLACE FUNCTION check_user_creation()
RETURNS trigger AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only administrators can create new users';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger for user creation check
DROP TRIGGER IF EXISTS ensure_admin_creates_user ON auth.users;
CREATE TRIGGER ensure_admin_creates_user
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION check_user_creation();

-- Update profile policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Only allow profile access through proper channels
CREATE POLICY "Profiles are only accessible through proper authentication"
  ON profiles
  FOR ALL
  TO authenticated
  USING (
    (auth.uid() = id) OR is_admin()
  )
  WITH CHECK (
    (auth.uid() = id) OR is_admin()
  );