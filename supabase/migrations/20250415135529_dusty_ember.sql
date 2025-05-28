/*
  # Add RLS policies for categories table

  1. Changes
    - Add policies for authenticated users to manage categories
    - Enable RLS on categories table
    - Set up proper security checks
*/

-- First ensure RLS is enabled
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Categories are viewable by authenticated users" ON categories;
DROP POLICY IF EXISTS "Users can insert categories" ON categories;
DROP POLICY IF EXISTS "Users can update their own categories" ON categories;
DROP POLICY IF EXISTS "Users can delete their own categories" ON categories;

-- Create new policies
CREATE POLICY "enable_read_for_authenticated_users"
ON categories FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "enable_insert_for_authenticated_users"
ON categories FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "enable_update_for_authenticated_users"
ON categories FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "enable_delete_for_authenticated_users"
ON categories FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');