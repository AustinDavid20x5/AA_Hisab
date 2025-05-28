/*
  # Update Transaction Type Schema and Voucher Number Generation

  1. Changes
    - Remove voucher_no_prefix column
    - Update voucher number generation logic
    - Add sequence for auto-incrementing voucher numbers
    - Update existing data
*/

-- First create a sequence for voucher numbers
CREATE SEQUENCE IF NOT EXISTS voucher_number_seq
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  CACHE 1;

-- Remove voucher_no_prefix column
ALTER TABLE tbl_trans_type
  DROP COLUMN IF EXISTS voucher_no_prefix;

-- Drop existing function and recreate with new logic
DROP FUNCTION IF EXISTS set_voucher_number() CASCADE;

-- Create improved voucher number generation function
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
  WHERE id = NEW.transaction_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction type not found';
  END IF;

  -- Get next number and pad with zeros
  v_next_number := LPAD(nextval('voucher_number_seq')::text, 6, '0');

  -- Set voucher number (type code + padded number)
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

-- Create trigger for voucher number generation
CREATE TRIGGER before_insert_set_voucher_number
  BEFORE INSERT ON gl_headers
  FOR EACH ROW
  EXECUTE FUNCTION set_voucher_number();

-- Update existing transaction types
UPDATE tbl_trans_type
SET description = CASE transaction_type_code
  WHEN 'JV' THEN 'Journal Voucher'
  WHEN 'GENTRD' THEN 'General Trading'
  WHEN 'IPT' THEN 'Inter Party Transfer'
  WHEN 'IPTCOM' THEN 'Inter Party Transfer with Commission'
  WHEN 'MNGCHK' THEN 'Manager Cheque'
  WHEN 'BNKTRF' THEN 'Bank Transfer'
  WHEN 'CASH' THEN 'Cash Transaction'
  ELSE description
END;

-- Ensure CASH transaction type exists
INSERT INTO tbl_trans_type (
  transaction_type_code,
  description
)
VALUES (
  'CASH',
  'Cash Transaction'
)
ON CONFLICT (transaction_type_code) 
DO UPDATE SET description = EXCLUDED.description;

-- Add constraint to ensure voucher numbers follow the pattern
ALTER TABLE gl_headers
  ADD CONSTRAINT valid_voucher_number_format
  CHECK (
    voucher_no ~ '^[A-Z]+[0-9]{6}$'
  );

-- Create index for faster voucher number lookups
CREATE INDEX IF NOT EXISTS idx_gl_headers_voucher_no
  ON gl_headers(voucher_no);