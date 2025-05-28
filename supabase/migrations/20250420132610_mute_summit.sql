/*
  # Update cash book balance function

  1. Changes
    - Modify get_cash_book_balance function to accept date parameter
    - Calculate balance up to the specified date
    - Return balance per currency

  2. Security
    - Function accessible to authenticated users only
*/

CREATE OR REPLACE FUNCTION public.get_cash_book_balance(
  p_account_id uuid,
  p_date date
)
RETURNS TABLE (
  currency_id uuid,
  currency_code text,
  balance numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH transactions AS (
    SELECT 
      t.currency_id,
      c.code as currency_code,
      SUM(t.debit - t.credit) as total_balance
    FROM gl_transactions t
    JOIN gl_headers h ON h.id = t.header_id
    JOIN currencies c ON c.id = t.currency_id
    WHERE t.account_id = p_account_id
      AND h.status = 'posted'
      AND h.transaction_date <= p_date
    GROUP BY t.currency_id, c.code
  )
  SELECT 
    t.currency_id,
    t.currency_code,
    COALESCE(t.total_balance, 0) as balance
  FROM transactions t;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_cash_book_balance(uuid, date) TO authenticated;