/*
  # Rename Transaction Type Column and Update Foreign Key

  1. Changes
    - Drop existing transaction_type_id column
    - Add new trans_id column
    - Add foreign key constraint to tbl_trans_type
    - Add helpful indexes
*/

-- First ensure tbl_trans_type table exists with correct structure
CREATE TABLE IF NOT EXISTS tbl_trans_type (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type_code text NOT NULL UNIQUE,
  description text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Drop old column and add new one
ALTER TABLE gl_headers 
  DROP COLUMN IF EXISTS "transaction_type_id uuid",
  DROP COLUMN IF EXISTS transaction_type_id,
  ADD COLUMN trans_id uuid;

-- Add foreign key constraint
ALTER TABLE gl_headers
  DROP CONSTRAINT IF EXISTS gl_headers_trans_id_fkey,
  ADD CONSTRAINT gl_headers_trans_id_fkey 
  FOREIGN KEY (trans_id) 
  REFERENCES tbl_trans_type(id)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Add indexes for better performance
DROP INDEX IF EXISTS idx_gl_headers_transaction_type_id;
CREATE INDEX idx_gl_headers_trans_id
  ON gl_headers(trans_id);

CREATE INDEX IF NOT EXISTS idx_tbl_trans_type_id
  ON tbl_trans_type(id);

CREATE INDEX IF NOT EXISTS idx_tbl_trans_type_code
  ON tbl_trans_type(transaction_type_code);

-- Ensure RLS is enabled
ALTER TABLE tbl_trans_type ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Reference data viewable by authenticated users" ON tbl_trans_type;
DROP POLICY IF EXISTS "enable_read_for_authenticated_users" ON tbl_trans_type;
DROP POLICY IF EXISTS "enable_insert_for_authenticated_users" ON tbl_trans_type;
DROP POLICY IF EXISTS "enable_update_for_authenticated_users" ON tbl_trans_type;
DROP POLICY IF EXISTS "enable_delete_for_authenticated_users" ON tbl_trans_type;

-- Create new policies
CREATE POLICY "enable_read_for_authenticated_users"
ON tbl_trans_type FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "enable_insert_for_authenticated_users"
ON tbl_trans_type FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "enable_update_for_authenticated_users"
ON tbl_trans_type FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "enable_delete_for_authenticated_users"
ON tbl_trans_type FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');

-- Insert initial transaction types if they don't exist
INSERT INTO tbl_trans_type (transaction_type_code, description)
VALUES 
  ('CASH', 'Cash Transaction')
ON CONFLICT (transaction_type_code) 
DO UPDATE SET description = EXCLUDED.description;