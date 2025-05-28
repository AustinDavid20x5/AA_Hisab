/*
  # Fix Cash Book Balance Calculation

  1. Changes
    - Update get_cash_book_balance function to handle document currency amounts
    - Apply exchange rate calculations correctly
    - Fix balance calculation for multi-currency accounts
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
  WITH transactions AS (
    SELECT 
      t.currency_id,
      c.code::text as currency_code,
      CASE 
        WHEN c.exchange_rate_note = 'multiply' THEN
          SUM(
            CASE 
              WHEN t.debit > 0 THEN t.debit_doc_currency * t.exchange_rate
              ELSE -t.credit_doc_currency * t.exchange_rate
            END
          )
        WHEN c.exchange_rate_note = 'divide' THEN
          SUM(
            CASE 
              WHEN t.debit > 0 THEN t.debit_doc_currency / NULLIF(t.exchange_rate, 0)
              ELSE -t.credit_doc_currency / NULLIF(t.exchange_rate, 0)
            END
          )
        ELSE
          -- For base currency, use the original amounts
          SUM(t.debit - t.credit)
      END as total_balance
    FROM gl_transactions t
    JOIN gl_headers h ON h.id = t.header_id
    JOIN currencies c ON c.id = t.currency_id
    WHERE t.account_id = p_account_id
      AND h.status = 'posted'
    GROUP BY t.currency_id, c.code, c.exchange_rate_note
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