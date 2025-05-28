/*
  # Add Document Currency Fields to GL Transactions

  1. New Fields
    - debit_doc_currency: Amount in document currency for debit entries
    - credit_doc_currency: Amount in document currency for credit entries
    - exchange_rate: Exchange rate used for conversion
    - document_currency: Currency code used in transaction

  2. Changes
    - Add new columns to gl_transactions table
    - Add helpful indexes for performance
*/

-- Add new columns to gl_transactions table
ALTER TABLE gl_transactions
  ADD COLUMN IF NOT EXISTS debit_doc_currency numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_doc_currency numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,4),
  ADD COLUMN IF NOT EXISTS document_currency text;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_gl_transactions_document_currency
  ON gl_transactions(document_currency);

CREATE INDEX IF NOT EXISTS idx_gl_transactions_exchange_rate
  ON gl_transactions(exchange_rate);

-- Update set_transaction_metadata function to copy exchange rate from header
CREATE OR REPLACE FUNCTION set_transaction_metadata()
RETURNS trigger AS $$
DECLARE
  v_header_exchange_rate numeric(10,4);
  v_header_currency text;
BEGIN
  -- Get exchange rate and currency from header
  SELECT h.exchange_rate, c.code
  INTO v_header_exchange_rate, v_header_currency
  FROM gl_headers h
  JOIN currencies c ON h.currency_id = c.id
  WHERE h.id = NEW.header_id;

  -- Set exchange rate and currency
  NEW.exchange_rate := v_header_exchange_rate;
  NEW.document_currency := v_header_currency;

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

-- Drop existing trigger
DROP TRIGGER IF EXISTS before_insert_update_transaction ON gl_transactions;

-- Create new trigger
CREATE TRIGGER before_insert_update_transaction
  BEFORE INSERT OR UPDATE ON gl_transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_transaction_metadata();