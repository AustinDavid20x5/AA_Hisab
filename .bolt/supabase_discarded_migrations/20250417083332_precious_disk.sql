/*
  # Update Currency Reference in GL Transactions

  1. Changes
    - Add currency_id column with foreign key constraint
    - Update existing records to use currency_id
    - Drop document_currency text column
    - Update triggers and functions
*/

-- First ensure the currencies table exists and has the correct structure
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'currencies'
  ) THEN
    RAISE EXCEPTION 'currencies table does not exist';
  END IF;
END $$;

-- Add currency_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'gl_transactions' 
    AND column_name = 'currency_id'
  ) THEN
    ALTER TABLE gl_transactions
      ADD COLUMN currency_id uuid REFERENCES currencies(id);
  END IF;
END $$;

-- Update existing records to set currency_id based on document_currency code
UPDATE gl_transactions
SET currency_id = c.id
FROM currencies c, gl_headers h
WHERE gt.header_id = h.id 
AND gt.document_currency = c.code;

-- Make currency_id NOT NULL after data migration
ALTER TABLE gl_transactions
  ALTER COLUMN currency_id SET NOT NULL;

-- Drop old column if it exists
ALTER TABLE gl_transactions
  DROP COLUMN IF EXISTS document_currency;

-- Update transaction metadata function
CREATE OR REPLACE FUNCTION set_transaction_metadata()
RETURNS trigger AS $$
DECLARE
  v_header_exchange_rate numeric(10,4);
  v_header_currency_id uuid;
BEGIN
  -- Get exchange rate and currency from header
  SELECT h.exchange_rate, h.currency_id
  INTO v_header_exchange_rate, v_header_currency_id
  FROM gl_headers h
  WHERE h.id = NEW.header_id;

  -- Set exchange rate and currency
  NEW.exchange_rate := v_header_exchange_rate;
  NEW.currency_id := v_header_currency_id;

  -- Calculate document currency amounts based on exchange rate
  IF NEW.debit > 0 THEN
    NEW.debit_doc_currency := NEW.debit / v_header_exchange_rate;
    NEW.credit_doc_currency := 0;
  ELSE
    NEW.debit_doc_currency := 0;
    NEW.credit_doc_currency := NEW.credit / v_header_exchange_rate;
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

-- Drop and recreate trigger to ensure it uses the latest function version
DROP TRIGGER IF EXISTS before_insert_update_transaction ON gl_transactions;
CREATE TRIGGER before_insert_update_transaction
  BEFORE INSERT OR UPDATE ON gl_transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_transaction_metadata();