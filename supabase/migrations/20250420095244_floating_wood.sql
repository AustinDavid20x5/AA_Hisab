/*
  # Fix currency code type mismatch

  1. Changes
    - Modify get_cash_book_balance function to cast currency code to text type
    - Ensure return type matches the expected structure

  2. Technical Details
    - Cast character(4) currency code to text type
    - Keep the same function signature and parameters
    - Maintain existing functionality while fixing type issue
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
  SELECT 
    COALESCE(SUM(CASE 
      WHEN c.exchange_rate_note = 'multiply' THEN
        (gt.debit - gt.credit) * gt.exchange_rate
      ELSE
        (gt.debit - gt.credit) / NULLIF(gt.exchange_rate, 0)
    END), 0) as balance,
    c.id as currency_id,
    c.code::text as currency_code
  FROM gl_transactions gt
  JOIN gl_headers gh ON gt.header_id = gh.id
  JOIN currencies c ON gt.currency_id = c.id
  WHERE gt.account_id = p_account_id
    AND gh.status = 'posted'
  GROUP BY c.id, c.code;
END;
$$;