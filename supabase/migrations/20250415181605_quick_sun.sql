/*
  # Rename Transaction Type Columns

  1. Changes
    - Rename id to type_id in tbl_trans_type table
    - Rename trans_id to type_id in gl_headers table
    - Update foreign key constraints and indexes
*/

-- First rename the id column in tbl_trans_type
ALTER TABLE tbl_trans_type
  RENAME COLUMN id TO type_id;

-- Drop existing indexes and constraints
DROP INDEX IF EXISTS idx_gl_headers_trans_id;
DROP INDEX IF EXISTS idx_tbl_trans_type_id;
ALTER TABLE gl_headers
  DROP CONSTRAINT IF EXISTS gl_headers_trans_id_fkey;

-- Rename trans_id to type_id in gl_headers
ALTER TABLE gl_headers
  RENAME COLUMN trans_id TO type_id;

-- Add new foreign key constraint
ALTER TABLE gl_headers
  ADD CONSTRAINT gl_headers_type_id_fkey 
  FOREIGN KEY (type_id) 
  REFERENCES tbl_trans_type(type_id)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Create new indexes
CREATE INDEX idx_gl_headers_type_id
  ON gl_headers(type_id);

CREATE INDEX idx_tbl_trans_type_type_id
  ON tbl_trans_type(type_id);

-- Update primary key name
ALTER TABLE tbl_trans_type 
  RENAME CONSTRAINT tbl_trans_type_pkey TO tbl_trans_type_type_id_pkey;

-- Ensure RLS is enabled
ALTER TABLE tbl_trans_type ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies with updated column names
DROP POLICY IF EXISTS "enable_read_for_authenticated_users" ON tbl_trans_type;
DROP POLICY IF EXISTS "enable_insert_for_authenticated_users" ON tbl_trans_type;
DROP POLICY IF EXISTS "enable_update_for_authenticated_users" ON tbl_trans_type;
DROP POLICY IF EXISTS "enable_delete_for_authenticated_users" ON tbl_trans_type;

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

-- Update functions that reference these columns
CREATE OR REPLACE FUNCTION set_voucher_number()
RETURNS trigger AS $$
DECLARE
  v_trans_type_code text;
  v_next_number text;
BEGIN
  -- Get transaction type code
  SELECT transaction_type_code 
  INTO v_trans_type_code
  FROM tbl_trans_type
  WHERE type_id = NEW.type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction type not found';
  END IF;

  -- Get next number and pad with zeros
  v_next_number := LPAD(nextval('voucher_number_seq')::text, 6, '0');

  -- Set voucher number
  NEW.voucher_no := v_trans_type_code || v_next_number;
  
  -- Set metadata
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  NEW.updated_by := auth.uid();
  NEW.created_at := COALESCE(NEW.created_at, CURRENT_TIMESTAMP);
  NEW.updated_at := CURRENT_TIMESTAMP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;