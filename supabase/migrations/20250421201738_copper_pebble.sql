/*
  # Fix Cash Book Balance Calculation

  1. Changes
    - Update get_cash_book_balance function to match trial balance logic
    - Use same calculation method for consistent results
    - Handle posted transactions only
*/

-- Drop existing function
DROP FUNCTION IF EXISTS get_cash_book_balance(uuid);

-- Create improved cash book balance function
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
  WITH account_balances AS (
    SELECT 
      t.currency_id,
      c.code::text as currency_code,
      COALESCE(SUM(
        CASE 
          WHEN t.debit > 0 THEN t.debit
          ELSE 0 
        END
      ), 0) as total_debit,
      COALESCE(SUM(
        CASE 
          WHEN t.credit > 0 THEN t.credit
          ELSE 0 
        END
      ), 0) as total_credit
    FROM gl_transactions t
    JOIN gl_headers h ON t.header_id = h.id
    JOIN currencies c ON t.currency_id = c.id
    WHERE t.account_id = p_account_id
      AND h.status = 'posted'
    GROUP BY t.currency_id, c.code
  )
  SELECT 
    (ab.total_debit - ab.total_credit) as balance,
    ab.currency_id,
    ab.currency_code
  FROM account_balances ab;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_cash_book_balance(uuid) TO authenticated;