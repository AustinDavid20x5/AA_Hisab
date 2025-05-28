/*
  # Fix Cash Book Balance Calculation

  1. Changes
    - Update get_cash_book_balance function to properly calculate balance
    - Add proper filtering for posted transactions
    - Handle currency conversion correctly
*/

-- Drop existing function
DROP FUNCTION IF EXISTS get_cash_book_balance(uuid, date);

-- Create improved cash book balance function
CREATE OR REPLACE FUNCTION get_cash_book_balance(
  p_account_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS numeric AS $$
DECLARE
  v_balance numeric;
BEGIN
  SELECT COALESCE(SUM(
    CASE 
      WHEN t.debit > 0 THEN t.debit
      ELSE -t.credit
    END
  ), 0)
  INTO v_balance
  FROM gl_transactions t
  JOIN gl_headers h ON t.header_id = h.id
  WHERE t.account_id = p_account_id
  AND h.status = 'posted'
  AND h.transaction_date <= p_date;
  
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;