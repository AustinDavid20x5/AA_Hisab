/*
  # Update Currency Reference in GL Transactions

  1. Changes
    - Add currency_id column to gl_transactions table
    - Add foreign key constraint to currencies table
    - Drop document_currency text column
    - Update triggers and functions
*/

-- First add the new column
ALTER TABLE gl_transactions
  ADD COLUMN currency_id uuid REFERENCES currencies(id);

-- Update existing records to set currency_id based on document_currency code
UPDATE gl_transactions gt
SET currency_id = c.id
FROM currencies c
WHERE c.code = gt.document_currency;

-- Make currency_id NOT NULL after data migration
ALTER TABLE gl_transactions
  ALTER COLUMN currency_id SET NOT NULL;

-- Drop old column
ALTER TABLE gl_transactions
  DROP COLUMN document_currency;

-- Update transaction metadata function to handle currency_id
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

  -- Calculate document currency amounts
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