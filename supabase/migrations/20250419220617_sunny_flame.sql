/*
  # Fix Currency Handling in Transactions

  1. Changes
    - Update existing null currency_id values
    - Add NOT NULL constraint
    - Add foreign key constraint with proper actions
    - Add helpful indexes
*/

-- First update any existing null currency_id values
UPDATE gl_transactions gt
SET currency_id = h.currency_id
FROM gl_headers h
WHERE gt.header_id = h.id
AND gt.currency_id IS NULL;

-- Ensure the foreign key constraint exists
ALTER TABLE gl_transactions
  DROP CONSTRAINT IF EXISTS fk_currency,
  ADD CONSTRAINT fk_currency 
  FOREIGN KEY (currency_id) 
  REFERENCES currencies(id)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Now we can safely add NOT NULL constraint
ALTER TABLE gl_transactions
  ALTER COLUMN currency_id SET NOT NULL;

-- Add index for better join performance
CREATE INDEX IF NOT EXISTS idx_gl_transactions_currency_id
  ON gl_transactions(currency_id);

-- Update transaction metadata function to handle currency
CREATE OR REPLACE FUNCTION set_transaction_metadata()
RETURNS trigger AS $$
DECLARE
  v_header_currency_id uuid;
BEGIN
  -- Get currency from header
  SELECT h.currency_id
  INTO v_header_currency_id
  FROM gl_headers h
  WHERE h.id = NEW.header_id;

  -- Set currency ID from header if not explicitly set
  IF NEW.currency_id IS NULL THEN
    NEW.currency_id := v_header_currency_id;
  END IF;

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