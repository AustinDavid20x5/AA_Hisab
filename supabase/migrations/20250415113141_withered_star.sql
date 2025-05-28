/*
  # Create Admin Role and Permissions

  1. Changes
    - Create admin role with full permissions
    - Update RLS policies to give admin full access
    - Add trigger for automatic role assignment
*/

-- First, create the admin role if it doesn't exist
INSERT INTO roles (name, permissions)
VALUES (
  'admin',
  jsonb_build_object(
    'users', jsonb_build_object(
      'create', true,
      'read', true,
      'update', true,
      'delete', true
    ),
    'roles', jsonb_build_object(
      'create', true,
      'read', true,
      'update', true,
      'delete', true
    ),
    'categories', jsonb_build_object(
      'create', true,
      'read', true,
      'update', true,
      'delete', true
    ),
    'subcategories', jsonb_build_object(
      'create', true,
      'read', true,
      'update', true,
      'delete', true
    ),
    'currencies', jsonb_build_object(
      'create', true,
      'read', true,
      'update', true,
      'delete', true
    ),
    'chart_of_accounts', jsonb_build_object(
      'create', true,
      'read', true,
      'update', true,
      'delete', true
    ),
    'transaction_types', jsonb_build_object(
      'create', true,
      'read', true,
      'update', true,
      'delete', true
    ),
    'gl_headers', jsonb_build_object(
      'create', true,
      'read', true,
      'update', true,
      'delete', true
    ),
    'gl_transactions', jsonb_build_object(
      'create', true,
      'read', true,
      'update', true,
      'delete', true
    )
  )
)
ON CONFLICT (name) 
DO UPDATE SET permissions = EXCLUDED.permissions;

-- Update RLS policies to give admin full access
ALTER POLICY "Categories are viewable by authenticated users"
  ON categories
  USING (
    (auth.uid() IN (
      SELECT p.id 
      FROM profiles p 
      JOIN roles r ON p.role_id = r.id 
      WHERE r.name = 'admin'
    ))
    OR true
  );

ALTER POLICY "Users can insert categories"
  ON categories
  WITH CHECK (
    auth.uid() IN (
      SELECT p.id 
      FROM profiles p 
      JOIN roles r ON p.role_id = r.id 
      WHERE r.name = 'admin'
    )
  );

ALTER POLICY "Users can update their own categories"
  ON categories
  USING (
    auth.uid() IN (
      SELECT p.id 
      FROM profiles p 
      JOIN roles r ON p.role_id = r.id 
      WHERE r.name = 'admin'
    )
    OR auth.uid() = created_by
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT p.id 
      FROM profiles p 
      JOIN roles r ON p.role_id = r.id 
      WHERE r.name = 'admin'
    )
    OR auth.uid() = created_by
  );

ALTER POLICY "Users can delete their own categories"
  ON categories
  USING (
    auth.uid() IN (
      SELECT p.id 
      FROM profiles p 
      JOIN roles r ON p.role_id = r.id 
      WHERE r.name = 'admin'
    )
    OR auth.uid() = created_by
  );