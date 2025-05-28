/*
  # Fix Transaction Type Schema and Foreign Key Relationship

  1. Changes
    - Drop existing column with incorrect name
    - Add proper foreign key constraint
    - Add helpful indexes
    - Set up RLS policies
*/

-- First ensure tbl_trans_type table exists with correct structure
CREATE TABLE IF NOT EXISTS tbl_trans_type (
  type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type_code text NOT NULL UNIQUE,
  description text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Fix the column in gl_headers
ALTER TABLE gl_headers 
  DROP COLUMN IF EXISTS "transaction_type_id uuid",
  DROP COLUMN IF EXISTS transaction_type_id;

-- Add foreign key constraint
ALTER TABLE gl_headers
  DROP CONSTRAINT IF EXISTS gl_headers_type_id_fkey,
  ADD CONSTRAINT gl_headers_type_id_fkey 
  FOREIGN KEY (type_id) 
  REFERENCES tbl_trans_type(type_id)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Ensure RLS is enabled
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
DROP POLICY IF EXISTS "trans_type_select_policy_v1" ON tbl_trans_type;
DROP POLICY IF EXISTS "trans_type_insert_policy_v1" ON tbl_trans_type;
DROP POLICY IF EXISTS "trans_type_update_policy_v1" ON tbl_trans_type;
DROP POLICY IF EXISTS "trans_type_delete_policy_v1" ON tbl_trans_type;
DROP POLICY IF EXISTS "trans_type_select_policy_v2" ON tbl_trans_type;
DROP POLICY IF EXISTS "trans_type_insert_policy_v2" ON tbl_trans_type;
DROP POLICY IF EXISTS "trans_type_update_policy_v2" ON tbl_trans_type;
DROP POLICY IF EXISTS "trans_type_delete_policy_v2" ON tbl_trans_type;

-- Create new policies with unique names
CREATE POLICY "trans_type_select_policy_v3"
ON tbl_trans_type FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "trans_type_insert_policy_v3"
ON tbl_trans_type FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "trans_type_update_policy_v3"
ON tbl_trans_type FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "trans_type_delete_policy_v3"
ON tbl_trans_type FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_gl_headers_type_id
  ON gl_headers(type_id);

CREATE INDEX IF NOT EXISTS idx_tbl_trans_type_transaction_type_code
  ON tbl_trans_type(transaction_type_code);

-- Insert initial transaction types if they don't exist
INSERT INTO tbl_trans_type (transaction_type_code, description)
VALUES 
  ('CASH', 'Cash Transaction')
ON CONFLICT (transaction_type_code) 
DO UPDATE SET description = EXCLUDED.description;