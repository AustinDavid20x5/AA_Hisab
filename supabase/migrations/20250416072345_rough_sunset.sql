/*
  # Fix Transaction Type Schema and Constraints

  1. Changes
    - Drop existing transaction_type_id column
    - Add type_id column with proper constraints
    - Add RLS policies with unique names
    - Insert CASH transaction type
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

-- Fix gl_headers table structure
ALTER TABLE gl_headers 
  DROP CONSTRAINT IF EXISTS gl_headers_transaction_type_id_fkey,
  DROP COLUMN IF EXISTS transaction_type_id,
  DROP COLUMN IF EXISTS "transaction_type_id uuid",
  DROP COLUMN IF EXISTS type_id;

ALTER TABLE gl_headers 
  ADD COLUMN type_id uuid NOT NULL REFERENCES tbl_trans_type(type_id);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_gl_headers_type_id
  ON gl_headers(type_id);

CREATE INDEX IF NOT EXISTS idx_tbl_trans_type_type_id
  ON tbl_trans_type(type_id);

CREATE INDEX IF NOT EXISTS idx_tbl_trans_type_code
  ON tbl_trans_type(transaction_type_code);

-- Ensure RLS is enabled
ALTER TABLE tbl_trans_type ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DO $$ 
BEGIN
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
  DROP POLICY IF EXISTS "trans_type_select_policy_v3" ON tbl_trans_type;
  DROP POLICY IF EXISTS "trans_type_insert_policy_v3" ON tbl_trans_type;
  DROP POLICY IF EXISTS "trans_type_update_policy_v3" ON tbl_trans_type;
  DROP POLICY IF EXISTS "trans_type_delete_policy_v3" ON tbl_trans_type;
END $$;

-- Create new policies with unique names
CREATE POLICY "trans_type_select_policy_v4"
ON tbl_trans_type FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "trans_type_insert_policy_v4"
ON tbl_trans_type FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "trans_type_update_policy_v4"
ON tbl_trans_type FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "trans_type_delete_policy_v4"
ON tbl_trans_type FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');

-- Insert initial transaction types
INSERT INTO tbl_trans_type (transaction_type_code, description)
VALUES 
  ('CASH', 'Cash Transaction')
ON CONFLICT (transaction_type_code) 
DO UPDATE SET description = EXCLUDED.description;