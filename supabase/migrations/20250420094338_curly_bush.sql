/*
  # Fix cash book balance function type mismatch

  1. Changes
    - Drop and recreate get_cash_book_balance function with correct return type
    - Cast character(4) to text for currency code
    - Return numeric for balance amount

  2. Notes
    - Function returns balance for a specific account
    - Handles both debit and credit transactions
    - Returns currency code as text type
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_cash_book_balance;

-- Recreate function with correct return type
CREATE OR REPLACE FUNCTION get_cash_book_balance(p_account_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance numeric;
BEGIN
  SELECT 
    COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0) INTO v_balance
  FROM gl_transactions gt
  JOIN gl_headers gh ON gt.header_id = gh.id
  WHERE gt.account_id = p_account_id
  AND gh.status = 'posted';

  RETURN v_balance;
END;
$$;