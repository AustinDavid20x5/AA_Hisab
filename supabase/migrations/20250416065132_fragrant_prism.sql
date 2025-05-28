/*
  # Update Voucher Number Generation

  1. Changes
    - Create sequence for auto-incrementing voucher numbers
    - Update voucher number generation function
    - Add proper constraints and indexes
*/

-- Reset and recreate the sequence
DROP SEQUENCE IF EXISTS voucher_number_seq;
CREATE SEQUENCE voucher_number_seq
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  MAXVALUE 999999
  CYCLE;

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
  WHERE type_id = NEW.type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction type not found';
  END IF;

  -- Get next number and pad with zeros to ensure 6 digits
  v_next_number := LPAD(nextval('voucher_number_seq')::text, 6, '0');

  -- Set voucher number (type code + 6-digit number)
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

-- First drop the constraint if it exists
ALTER TABLE gl_headers
  DROP CONSTRAINT IF EXISTS gl_headers_voucher_no_key;

-- Then drop the index if it exists
DROP INDEX IF EXISTS gl_headers_voucher_no_key;

-- Update pattern constraint
ALTER TABLE gl_headers
  DROP CONSTRAINT IF EXISTS valid_voucher_number_format,
  ADD CONSTRAINT valid_voucher_number_format
  CHECK (
    voucher_no ~ '^[A-Z]+[0-9]{6}$'
  );

-- Create index for faster voucher number lookups
DROP INDEX IF EXISTS idx_gl_headers_voucher_no;
CREATE INDEX idx_gl_headers_voucher_no
  ON gl_headers(voucher_no);

-- Add unique constraint (this will create both the constraint and the supporting index)
ALTER TABLE gl_headers
  ADD CONSTRAINT gl_headers_voucher_no_key
  UNIQUE (voucher_no);