/*
  # Remove Currency Fields from GL Headers
  
  1. Changes
    - Drop currency_id and exchange_rate_head columns from gl_headers
    - Update transaction metadata function to remove header currency dependency
    - Add exchange rate constraint to gl_transactions
*/

-- Drop currency-related columns from gl_headers
ALTER TABLE gl_headers
  DROP CONSTRAINT IF EXISTS gl_headers_currency_id_fkey,
  DROP CONSTRAINT IF EXISTS gl_headers_exchange_rate_head_check,
  DROP COLUMN IF EXISTS currency_id,
  DROP COLUMN IF EXISTS exchange_rate_head;

-- Add exchange rate constraint to gl_transactions
ALTER TABLE gl_transactions
  DROP CONSTRAINT IF EXISTS gl_transactions_exchange_rate_check,
  ADD CONSTRAINT gl_transactions_exchange_rate_check 
  CHECK (exchange_rate > 0);

-- Update transaction metadata function to remove header currency dependency
CREATE OR REPLACE FUNCTION set_transaction_metadata()
RETURNS trigger AS $$
BEGIN
  -- Set metadata
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  NEW.updated_by := auth.uid();
  NEW.created_at := COALESCE(NEW.created_at, CURRENT_TIMESTAMP);
  NEW.updated_at := CURRENT_TIMESTAMP;
  
  -- Calculate document currency amounts based on exchange rate
  IF NEW.debit > 0 THEN
    NEW.debit_doc_currency := NEW.debit / NEW.exchange_rate;
    NEW.credit_doc_currency := 0;
  ELSE
    NEW.debit_doc_currency := 0;
    NEW.credit_doc_currency := NEW.credit / NEW.exchange_rate;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add index for exchange rate lookups
CREATE INDEX IF NOT EXISTS idx_gl_transactions_exchange_rate
  ON gl_transactions(exchange_rate);

-- Add index for currency lookups
CREATE INDEX IF NOT EXISTS idx_gl_transactions_currency_id
  ON gl_transactions(currency_id);