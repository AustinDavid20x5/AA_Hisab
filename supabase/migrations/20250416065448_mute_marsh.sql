/*
  # Fix Database Structure and Relationships

  1. Changes
    - Drop existing problematic constraints and columns
    - Create tbl_trans_type table with correct structure
    - Add type_id column to gl_headers
    - Set up proper foreign key relationships
    - Add necessary indexes and constraints
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
  ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES tbl_trans_type(type_id);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_gl_headers_type_id
  ON gl_headers(type_id);

CREATE INDEX IF NOT EXISTS idx_tbl_trans_type_type_id
  ON tbl_trans_type(type_id);

CREATE INDEX IF NOT EXISTS idx_tbl_trans_type_code
  ON tbl_trans_type(transaction_type_code);

-- Add check constraints
ALTER TABLE gl_headers
  DROP CONSTRAINT IF EXISTS gl_headers_status_check,
  ADD CONSTRAINT gl_headers_status_check 
    CHECK (status IN ('draft', 'posted', 'void'));

ALTER TABLE gl_headers
  DROP CONSTRAINT IF EXISTS gl_headers_exchange_rate_check,
  ADD CONSTRAINT gl_headers_exchange_rate_check 
    CHECK (exchange_rate > 0);

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

-- Create RLS policies with unique names
CREATE POLICY "trans_type_select_policy_v2"
ON tbl_trans_type FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "trans_type_insert_policy_v2"
ON tbl_trans_type FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "trans_type_update_policy_v2"
ON tbl_trans_type FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "trans_type_delete_policy_v2"
ON tbl_trans_type FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');

-- Insert initial transaction types
INSERT INTO tbl_trans_type (transaction_type_code, description)
VALUES 
  ('CASH', 'Cash Transaction'),
  ('JV', 'Journal Voucher'),
  ('GENTRD', 'General Trading'),
  ('IPT', 'Inter Party Transfer'),
  ('IPTCOM', 'Inter Party Transfer with Commission'),
  ('MNGCHK', 'Manager Cheque'),
  ('BNKTRF', 'Bank Transfer')
ON CONFLICT (transaction_type_code) 
DO UPDATE SET description = EXCLUDED.description;

-- Update voucher number generation function
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

-- Recreate trigger for voucher number generation
DROP TRIGGER IF EXISTS before_insert_set_voucher_number ON gl_headers;
CREATE TRIGGER before_insert_set_voucher_number
  BEFORE INSERT ON gl_headers
  FOR EACH ROW
  EXECUTE FUNCTION set_voucher_number();