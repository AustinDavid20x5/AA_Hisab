/*
  # Fix Cash Book Balance Function

  1. Changes
    - Update get_cash_book_balance function to properly calculate balance
    - Ensure it returns the most up-to-date balance
    - Fix currency code type casting
*/

-- Drop existing function
DROP FUNCTION IF EXISTS get_cash_book_balance(uuid, date);
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
    t.total_balance as balance,
    t.currency_id,
    t.currency_code
  FROM transactions t;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_cash_book_balance(uuid) TO authenticated;