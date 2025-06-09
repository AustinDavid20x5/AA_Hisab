/*
  # Create get_account_balance Function

  1. Purpose
    - Calculate account balance using SUM(debit) - SUM(credit)
    - Support filtering by date
    - Return balance for any account

  2. Parameters
    - account_id: UUID of the account
    - as_of_date: Optional date filter (defaults to current date)
*/

-- Create get_account_balance function
CREATE OR REPLACE FUNCTION get_account_balance(
  p_account_id uuid,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance numeric := 0;
BEGIN
  -- Calculate balance as SUM(debit) - SUM(credit)
  SELECT COALESCE(SUM(debit) - SUM(credit), 0)
  INTO v_balance
  FROM gl_transactions t
  JOIN gl_headers h ON t.header_id = h.id
  WHERE t.account_id = p_account_id
    AND h.status = 'posted'
    AND h.transaction_date <= p_as_of_date;

  RETURN v_balance;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_account_balance(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_balance(uuid) TO authenticated;