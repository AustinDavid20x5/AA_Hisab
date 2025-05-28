/*
  # Rename exchange_rate to exchange_rate_head in gl_headers table

  1. Changes
    - Rename exchange_rate column to exchange_rate_head
    - Update constraints and triggers
    - Update functions that reference this column
*/

-- First rename the column
ALTER TABLE gl_headers
  RENAME COLUMN exchange_rate TO exchange_rate_head;

-- Update the exchange rate check constraint
ALTER TABLE gl_headers
  DROP CONSTRAINT IF EXISTS gl_headers_exchange_rate_check,
  ADD CONSTRAINT gl_headers_exchange_rate_head_check 
  CHECK (exchange_rate_head > 0);

-- Update set_transaction_metadata function to use new column name
CREATE OR REPLACE FUNCTION set_transaction_metadata()
RETURNS trigger AS $$
DECLARE
  v_header_exchange_rate numeric(10,4);
  v_header_currency_id uuid;
BEGIN
  -- Get exchange rate and currency from header
  SELECT h.exchange_rate_head, h.currency_id
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