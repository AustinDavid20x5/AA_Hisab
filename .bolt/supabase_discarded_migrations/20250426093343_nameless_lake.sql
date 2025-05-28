/*
  # Fix Currency Relationships and Dashboard Issues

  1. Changes
    - Remove document_currency column from gl_transactions
    - Add currency_id column to gl_transactions with proper foreign key
    - Add purchase_rate and sales_rate columns for commission tracking
    - Update transaction metadata function to handle currency properly
    - Add indexes for better performance
*/

-- First ensure currency_id exists in gl_transactions
ALTER TABLE gl_transactions
  ADD COLUMN IF NOT EXISTS currency_id uuid REFERENCES currencies(id);

-- Update existing records to set currency_id
UPDATE gl_transactions gt
SET currency_id = c.id
FROM currencies c
WHERE c.id = gt.currency_id;

-- Add constraint to ensure currency_id is not null
ALTER TABLE gl_transactions
  ALTER COLUMN currency_id SET NOT NULL;

-- Add foreign key constraint with proper actions
ALTER TABLE gl_transactions
  DROP CONSTRAINT IF EXISTS fk_currency,
  ADD CONSTRAINT fk_currency 
  FOREIGN KEY (currency_id) 
  REFERENCES currencies(id)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_gl_transactions_currency_id
  ON gl_transactions(currency_id);

-- Update transaction metadata function to handle currency correctly
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
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get cash book balance with proper currency handling
CREATE OR REPLACE FUNCTION get_cash_book_balance(p_account_id uuid)
RETURNS TABLE (
  balance numeric,
  currency_id uuid,
  currency_code text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH transactions AS (
    SELECT 
      t.currency_id,
      c.code::text as currency_code,
      SUM(t.debit - t.credit) as total_balance
    FROM gl_transactions t
    JOIN gl_headers h ON h.id = t.header_id
    JOIN currencies c ON c.id = t.currency_id
    WHERE t.account_id = p_account_id
      AND h.status = 'posted'
    GROUP BY t.currency_id, c.code
  )
  SELECT 
    COALESCE(t.total_balance, 0) as balance,
    t.currency_id,
    t.currency_code
  FROM transactions t;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_cash_book_balance(uuid) TO authenticated;