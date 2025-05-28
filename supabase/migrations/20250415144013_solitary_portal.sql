/*
  # Fix Chart of Accounts Access

  1. Changes
    - Add RLS policies for chart_of_accounts table
    - Enable authenticated users to manage accounts
    - Set up proper security checks
*/

-- First ensure RLS is enabled
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Reference data viewable by authenticated users" ON chart_of_accounts;

-- Create new policies
CREATE POLICY "enable_read_for_authenticated_users"
ON chart_of_accounts FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "enable_insert_for_authenticated_users"
ON chart_of_accounts FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "enable_update_for_authenticated_users"
ON chart_of_accounts FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "enable_delete_for_authenticated_users"
ON chart_of_accounts FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');