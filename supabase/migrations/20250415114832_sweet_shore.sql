/*
  # Create admin role and initial admin user

  1. Changes
    - Create admin role with full permissions
    - Create initial admin user profile
    - Add RLS policies for profiles table

  2. Security
    - Enable RLS on profiles table
    - Add policies for profile access
*/

-- Create admin role if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM roles 
    WHERE name = 'admin'
  ) THEN
    INSERT INTO roles (name, permissions)
    VALUES ('admin', '{"all": true}'::jsonb);
  END IF;
END $$;

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles table
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

-- Create policy for admin to view all profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT p.id 
      FROM profiles p 
      JOIN roles r ON p.role_id = r.id 
      WHERE r.name = 'admin'
    )
  );

-- Create policy for admin to update all profiles
CREATE POLICY "Admins can update all profiles"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT p.id 
      FROM profiles p 
      JOIN roles r ON p.role_id = r.id 
      WHERE r.name = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT p.id 
      FROM profiles p 
      JOIN roles r ON p.role_id = r.id 
      WHERE r.name = 'admin'
    )
  );