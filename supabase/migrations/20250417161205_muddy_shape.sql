/*
  # Update Cash Book Balance Function
  
  1. Changes
    - Add date parameter to get_cash_book_balance function
    - Filter transactions by date
    - Return balance up to specified date
*/

-- Drop existing function
DROP FUNCTION IF EXISTS get_cash_book_balance(uuid);

-- Create updated function with date parameter
CREATE OR REPLACE FUNCTION get_cash_book_balance(
  p_account_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS numeric AS $$
DECLARE
  v_balance numeric;
BEGIN
  SELECT COALESCE(SUM(debit - credit), 0)
  INTO v_balance
  FROM gl_transactions gt
  JOIN gl_headers gh ON gt.header_id = gh.id
  WHERE gt.account_id = p_account_id
  AND gh.status = 'posted'
  AND gh.transaction_date <= p_date;
  
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;