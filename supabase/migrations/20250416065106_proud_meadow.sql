/*
  # Fix Transaction Type Relationships

  1. Changes
    - Ensure CASH transaction type exists
    - Fix foreign key constraint using correct column names
    - Add proper indexes
*/

-- First ensure the CASH transaction type exists
DO $$ 
DECLARE
  v_type_id uuid;
BEGIN
  -- Insert or update CASH transaction type
  INSERT INTO tbl_trans_type (
    transaction_type_code,
    description
  )
  VALUES (
    'CASH',
    'Cash Transaction'
  )
  ON CONFLICT (transaction_type_code) DO UPDATE
  SET description = EXCLUDED.description
  RETURNING type_id INTO v_type_id;

  -- Verify the transaction type exists
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create or update CASH transaction type';
  END IF;
END $$;

-- Drop and recreate the foreign key constraint
ALTER TABLE gl_headers
  DROP CONSTRAINT IF EXISTS gl_headers_type_id_fkey;

ALTER TABLE gl_headers
  ADD CONSTRAINT gl_headers_type_id_fkey 
  FOREIGN KEY (type_id) 
  REFERENCES tbl_trans_type(type_id)
  ON DELETE RESTRICT;

-- Add index for transaction type lookup
CREATE INDEX IF NOT EXISTS idx_gl_headers_type_id
  ON gl_headers(type_id);

-- Add index for transaction type code lookup
CREATE INDEX IF NOT EXISTS idx_tbl_trans_type_code
  ON tbl_trans_type(transaction_type_code);

-- Verify and fix any orphaned records
DELETE FROM gl_headers 
WHERE type_id NOT IN (
  SELECT type_id FROM tbl_trans_type
);