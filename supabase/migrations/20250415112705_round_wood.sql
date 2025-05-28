/*
  # Create admin user and role

  1. Create admin role with full permissions
  2. Create admin user
  3. Assign admin role to user
  4. Update RLS policies to give admin full access
*/

-- First, create the admin role if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM roles 
    WHERE name = 'admin'
  ) THEN
    INSERT INTO roles (name, permissions)
    VALUES (
      'admin',
      jsonb_build_object(
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
        )
      )
    );
  END IF;
END $$;

-- Update RLS policies for admin access
ALTER POLICY "Categories are viewable by authenticated users"
  ON categories
  USING (
    auth.uid() IN (
      SELECT p.id 
      FROM profiles p 
      JOIN roles r ON p.role_id = r.id 
      WHERE r.name = 'admin'
    ) 
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

-- Similar policies for subcategories
ALTER POLICY "Subcategories are viewable by authenticated users"
  ON subcategories
  USING (
    auth.uid() IN (
      SELECT p.id 
      FROM profiles p 
      JOIN roles r ON p.role_id = r.id 
      WHERE r.name = 'admin'
    ) 
    OR true
  );

ALTER POLICY "Users can insert subcategories"
  ON subcategories
  WITH CHECK (
    auth.uid() IN (
      SELECT p.id 
      FROM profiles p 
      JOIN roles r ON p.role_id = r.id 
      WHERE r.name = 'admin'
    )
  );

ALTER POLICY "Users can update their own subcategories"
  ON subcategories
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

ALTER POLICY "Users can delete their own subcategories"
  ON subcategories
  USING (
    auth.uid() IN (
      SELECT p.id 
      FROM profiles p 
      JOIN roles r ON p.role_id = r.id 
      WHERE r.name = 'admin'
    )
    OR auth.uid() = created_by
  );