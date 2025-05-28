/*
  # Update Transaction Metadata Function

  1. Changes
    - Remove automatic exchange rate assignment from header
    - Use transaction's own exchange rate for calculations
    - Apply correct multiply/divide logic based on currency settings
*/

-- Update set_transaction_metadata function to handle exchange rates correctly
CREATE OR REPLACE FUNCTION set_transaction_metadata()
RETURNS trigger AS $$
DECLARE
  v_header_currency_id uuid;
  v_exchange_rate_note text;
BEGIN
  -- Get currency from header
  SELECT h.currency_id
  INTO v_header_currency_id
  FROM gl_headers h
  WHERE h.id = NEW.header_id;

  -- Get exchange rate note for the currency
  SELECT c.exchange_rate_note
  INTO v_exchange_rate_note
  FROM currencies c
  WHERE c.id = NEW.currency_id;

  -- Set currency ID from header
  NEW.currency_id := v_header_currency_id;

  -- Calculate document currency amounts based on exchange_rate_note
  IF NEW.debit > 0 THEN
    NEW.debit_doc_currency := CASE v_exchange_rate_note
      WHEN 'multiply' THEN NEW.debit * NEW.exchange_rate
      WHEN 'divide' THEN NEW.debit / NEW.exchange_rate
      ELSE NEW.debit -- For base currency
    END;
    NEW.credit_doc_currency := 0;
  ELSE
    NEW.debit_doc_currency := 0;
    NEW.credit_doc_currency := CASE v_exchange_rate_note
      WHEN 'multiply' THEN NEW.credit * NEW.exchange_rate
      WHEN 'divide' THEN NEW.credit / NEW.exchange_rate
      ELSE NEW.credit -- For base currency
    END;
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

-- Add constraint to ensure exchange_rate is provided
ALTER TABLE gl_transactions
  ADD CONSTRAINT gl_transactions_exchange_rate_check
  CHECK (exchange_rate > 0);

-- Add index for exchange rate lookups
CREATE INDEX IF NOT EXISTS idx_gl_transactions_exchange_rate
  ON gl_transactions(exchange_rate);