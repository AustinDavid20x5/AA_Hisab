/*
  # Fix Transaction Type Foreign Key

  1. Changes
    - Drop existing foreign key constraint
    - Add NOT NULL constraint
    - Add proper foreign key constraint
    - Add helpful indexes
    - Add validation trigger
*/

-- First drop the existing foreign key constraint if it exists
ALTER TABLE gl_headers
  DROP CONSTRAINT IF EXISTS gl_headers_type_id_fkey;

-- Add NOT NULL constraint
ALTER TABLE gl_headers
  ALTER COLUMN type_id SET NOT NULL;

-- Add the new foreign key constraint with proper actions
ALTER TABLE gl_headers
  ADD CONSTRAINT gl_headers_type_id_fkey 
  FOREIGN KEY (type_id) 
  REFERENCES tbl_trans_type(type_id)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Add indexes to improve join performance
CREATE INDEX IF NOT EXISTS idx_gl_headers_type_id
  ON gl_headers(type_id);

CREATE INDEX IF NOT EXISTS idx_tbl_trans_type_type_id
  ON tbl_trans_type(type_id);

-- Add trigger to validate transaction type existence
CREATE OR REPLACE FUNCTION validate_transaction_type()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tbl_trans_type 
    WHERE type_id = NEW.type_id
  ) THEN
    RAISE EXCEPTION 'Transaction type with ID % does not exist', NEW.type_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_transaction_type ON gl_headers;
CREATE TRIGGER trg_validate_transaction_type
  BEFORE INSERT OR UPDATE ON gl_headers
  FOR EACH ROW
  EXECUTE FUNCTION validate_transaction_type();