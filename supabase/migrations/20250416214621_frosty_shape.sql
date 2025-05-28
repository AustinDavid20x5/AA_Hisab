-- Drop existing function
DROP FUNCTION IF EXISTS get_trial_balance();

-- Create updated function with date parameter
CREATE OR REPLACE FUNCTION get_trial_balance(p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  code text,
  name text,
  debit numeric,
  credit numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH account_balances AS (
    SELECT 
      coa.id,
      coa.code::text,
      coa.name,
      COALESCE(SUM(
        CASE 
          WHEN t.debit > 0 AND h.status = 'posted' AND h.transaction_date <= p_date 
          THEN t.debit 
          ELSE 0 
        END
      ), 0) as total_debit,
      COALESCE(SUM(
        CASE 
          WHEN t.credit > 0 AND h.status = 'posted' AND h.transaction_date <= p_date 
          THEN t.credit 
          ELSE 0 
        END
      ), 0) as total_credit
    FROM chart_of_accounts coa
    LEFT JOIN gl_transactions t ON t.account_id = coa.id
    LEFT JOIN gl_headers h ON t.header_id = h.id
    GROUP BY coa.id, coa.code, coa.name
  )
  SELECT 
    ab.code,
    ab.name,
    CASE 
      WHEN (ab.total_debit - ab.total_credit) > 0 
      THEN (ab.total_debit - ab.total_credit) 
      ELSE 0 
    END as debit,
    CASE 
      WHEN (ab.total_credit - ab.total_debit) > 0 
      THEN (ab.total_credit - ab.total_debit) 
      ELSE 0 
    END as credit
  FROM account_balances ab
  WHERE ab.total_debit > 0 OR ab.total_credit > 0 OR EXISTS (
    -- Include accounts that have any transactions, even if current balance is 0
    SELECT 1 FROM gl_transactions t2
    JOIN gl_headers h2 ON t2.header_id = h2.id
    WHERE t2.account_id = ab.id
    AND h2.status = 'posted'
    AND h2.transaction_date <= p_date
  )
  ORDER BY ab.code;
END;
$$;