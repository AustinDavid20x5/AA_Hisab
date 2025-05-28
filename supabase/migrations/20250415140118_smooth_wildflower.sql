-- First ensure RLS is enabled
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Subcategories are viewable by authenticated users" ON subcategories;
DROP POLICY IF EXISTS "Users can insert subcategories" ON subcategories;
DROP POLICY IF EXISTS "Users can update their own subcategories" ON subcategories;
DROP POLICY IF EXISTS "Users can delete their own subcategories" ON subcategories;

-- Create new policies
CREATE POLICY "enable_read_for_authenticated_users"
ON subcategories FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "enable_insert_for_authenticated_users"
ON subcategories FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "enable_update_for_authenticated_users"
ON subcategories FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "enable_delete_for_authenticated_users"
ON subcategories FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');