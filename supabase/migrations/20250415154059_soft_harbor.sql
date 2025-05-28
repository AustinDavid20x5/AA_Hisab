/*
  # Add Helper Functions for Cash Entry

  1. New Functions
    - get_cash_book_balance: Calculate current balance for a cash book account
    - generate_voucher_number: Generate next voucher number for cash transactions
*/

-- Function to get cash book balance
CREATE OR REPLACE FUNCTION get_cash_book_balance(p_account_id uuid)
RETURNS numeric AS $$
DECLARE
  v_balance numeric;
BEGIN
  SELECT COALESCE(SUM(debit - credit), 0)
  INTO v_balance
  FROM gl_transactions gt
  JOIN gl_headers gh ON gt.header_id = gh.id
  WHERE gt.account_id = p_account_id
  AND gh.status = 'posted';
  
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql;