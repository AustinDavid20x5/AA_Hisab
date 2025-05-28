/*
  # Add RLS policies for currencies table

  1. Changes
    - Enable RLS on currencies table
    - Add policies for authenticated users to:
      - Read all currencies
      - Insert new currencies
      - Update existing currencies
      - Delete currencies (except base currency)

  2. Security
    - All authenticated users can read currencies
    - Only authenticated users can modify currencies
    - Prevent deletion of base currency
*/

-- First ensure RLS is enabled
ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Reference data viewable by authenticated users" ON currencies;

-- Create new policies
CREATE POLICY "enable_read_for_authenticated_users"
ON currencies FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "enable_insert_for_authenticated_users"
ON currencies FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "enable_update_for_authenticated_users"
ON currencies FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "enable_delete_for_non_base_currencies"
ON currencies FOR DELETE
TO authenticated
USING (
  auth.role() = 'authenticated' 
  AND NOT is_base
);