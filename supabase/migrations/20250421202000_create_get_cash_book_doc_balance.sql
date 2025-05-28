-- Create the get_cash_book_doc_balance function
CREATE OR REPLACE FUNCTION public.get_cash_book_doc_balance(p_account_id uuid)
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
      SUM(t.debit_doc_currency - t.credit_doc_currency) as total_balance
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
GRANT EXECUTE ON FUNCTION public.get_cash_book_doc_balance(uuid) TO authenticated;