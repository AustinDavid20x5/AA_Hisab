/*
  # Fix Transaction Type References

  1. Changes
    - Add type_id column to gl_headers
    - Add foreign key constraint
    - Set up RLS policies with unique names
    - Clean up old table
*/

-- First check if the column exists with a different name
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'gl_headers' 
    AND column_name = 'type_id uuid'
  ) THEN
    ALTER TABLE gl_headers 
      RENAME COLUMN "type_id uuid" TO type_id;
  END IF;
END $$;

-- Now add the column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'gl_headers' 
    AND column_name = 'type_id'
  ) THEN
    ALTER TABLE gl_headers 
      ADD COLUMN type_id uuid;
  END IF;
END $$;

-- Drop existing foreign key if it exists
ALTER TABLE gl_headers
  DROP CONSTRAINT IF EXISTS gl_headers_type_id_fkey;

-- Add foreign key constraint
ALTER TABLE gl_headers
  ADD CONSTRAINT gl_headers_type_id_fkey 
  FOREIGN KEY (type_id) 
  REFERENCES tbl_trans_type(type_id)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Drop old transaction_types table if it exists
DROP TABLE IF EXISTS transaction_types;

-- Ensure RLS is enabled on tbl_trans_type
ALTER TABLE tbl_trans_type ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Reference data viewable by authenticated users" ON tbl_trans_type;
DROP POLICY IF EXISTS "enable_read_for_authenticated_users" ON tbl_trans_type;
DROP POLICY IF EXISTS "enable_insert_for_authenticated_users" ON tbl_trans_type;
DROP POLICY IF EXISTS "enable_update_for_authenticated_users" ON tbl_trans_type;
DROP POLICY IF EXISTS "enable_delete_for_authenticated_users" ON tbl_trans_type;
DROP POLICY IF EXISTS "tbl_trans_type_select_policy" ON tbl_trans_type;
DROP POLICY IF EXISTS "tbl_trans_type_insert_policy" ON tbl_trans_type;
DROP POLICY IF EXISTS "tbl_trans_type_update_policy" ON tbl_trans_type;
DROP POLICY IF EXISTS "tbl_trans_type_delete_policy" ON tbl_trans_type;

-- Create new policies with unique names
CREATE POLICY "trans_type_select_policy_v1"
ON tbl_trans_type FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "trans_type_insert_policy_v1"
ON tbl_trans_type FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "trans_type_update_policy_v1"
ON tbl_trans_type FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "trans_type_delete_policy_v1"
ON tbl_trans_type FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');

-- Add index for better join performance
CREATE INDEX IF NOT EXISTS idx_gl_headers_type_id
  ON gl_headers(type_id);