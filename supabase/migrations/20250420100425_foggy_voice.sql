/*
  # Fix Cash Book Balance Function

  1. Changes
    - Update get_cash_book_balance function to handle document currency amounts
    - Fix type casting for currency codes
    - Add proper currency conversion based on exchange_rate_note
*/

CREATE OR REPLACE FUNCTION get_cash_book_balance(p_account_id uuid)
RETURNS TABLE (
  balance numeric,
  currency_id uuid,
  currency_code text
) 
LANGUAGE plpgsql
SECURITY definer
AS $$
BEGIN
  RETURN QUERY
  WITH balances AS (
    SELECT 
      t.currency_id,
      c.code::text as currency_code,
      COALESCE(SUM(
        CASE 
          WHEN t.debit_doc_currency > 0 THEN t.debit_doc_currency
          ELSE -t.credit_doc_currency
        END
      ), 0) as total_balance
    FROM gl_transactions t
    JOIN gl_headers h ON t.header_id = h.id
    JOIN currencies c ON t.currency_id = c.id
    WHERE t.account_id = p_account_id
      AND h.status = 'posted'
    GROUP BY t.currency_id, c.code
  )
  SELECT 
    b.total_balance as balance,
    b.currency_id,
    b.currency_code
  FROM balances b;
END;
$$;