/*
  # Fix Cash Book Balance Calculation

  1. Changes
    - Update get_cash_book_balance function to handle currencies correctly
    - Add currency filtering
    - Fix balance calculation
*/

-- Drop existing function
DROP FUNCTION IF EXISTS get_cash_book_balance(uuid, date);

-- Create improved cash book balance function
CREATE OR REPLACE FUNCTION get_cash_book_balance(
  p_account_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  balance numeric,
  currency_id uuid,
  currency_code text
) AS $$
BEGIN
  RETURN QUERY
  WITH balances AS (
    SELECT 
      t.currency_id,
      c.code as currency_code,
      COALESCE(SUM(
        CASE 
          WHEN t.debit > 0 THEN t.debit
          ELSE -t.credit
        END
      ), 0) as total_balance
    FROM gl_transactions t
    JOIN gl_headers h ON t.header_id = h.id
    JOIN currencies c ON t.currency_id = c.id
    WHERE t.account_id = p_account_id
    AND h.status = 'posted'
    AND h.transaction_date <= p_date
    GROUP BY t.currency_id, c.code
  )
  SELECT 
    b.total_balance as balance,
    b.currency_id,
    b.currency_code
  FROM balances b;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;