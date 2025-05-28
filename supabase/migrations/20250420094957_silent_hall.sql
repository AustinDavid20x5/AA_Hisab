/*
  # Fix Cash Book Balance Function for Multi-Currency Support

  1. Changes
    - Update function to return balances per currency
    - Add proper currency handling
    - Fix balance calculation for document and base currencies
*/

-- Drop existing function
DROP FUNCTION IF EXISTS get_cash_book_balance(uuid);

-- Create improved cash book balance function with multi-currency support
CREATE OR REPLACE FUNCTION get_cash_book_balance(p_account_id uuid)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;