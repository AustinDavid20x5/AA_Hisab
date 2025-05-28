/*
  # Fix Transaction Metadata Function

  1. Changes
    - Update set_transaction_metadata function to handle currency conversion correctly
    - Add proper handling of document currency amounts
    - Ensure exchange rate is properly applied
*/

-- Drop existing function
DROP FUNCTION IF EXISTS set_transaction_metadata();

-- Create improved transaction metadata function
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Header not found';
  END IF;

  -- Set exchange rate and currency
  NEW.exchange_rate := v_header_exchange_rate;
  NEW.currency_id := v_header_currency_id;

  -- Calculate document currency amounts
  IF NEW.debit > 0 THEN
    NEW.debit_doc_currency := NEW.debit / NULLIF(v_header_exchange_rate, 0);
    NEW.credit_doc_currency := 0;
  ELSIF NEW.credit > 0 THEN
    NEW.debit_doc_currency := 0;
    NEW.credit_doc_currency := NEW.credit / NULLIF(v_header_exchange_rate, 0);
  ELSE
    NEW.debit_doc_currency := 0;
    NEW.credit_doc_currency := 0;
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

-- Drop existing trigger
DROP TRIGGER IF EXISTS before_insert_update_transaction ON gl_transactions;

-- Create trigger for transaction metadata
CREATE TRIGGER before_insert_update_transaction
  BEFORE INSERT OR UPDATE ON gl_transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_transaction_metadata();