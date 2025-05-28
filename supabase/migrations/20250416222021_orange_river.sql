-- Drop existing function
DROP FUNCTION IF EXISTS get_trial_balance();

-- Create improved trial balance function
CREATE OR REPLACE FUNCTION get_trial_balance()
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
      coa.code::text,
      coa.name,
      COALESCE(SUM(
        CASE 
          WHEN t.debit > 0
          THEN t.debit 
          ELSE 0 
        END
      ), 0) as total_debit,
      COALESCE(SUM(
        CASE 
          WHEN t.credit > 0
          THEN t.credit 
          ELSE 0 
        END
      ), 0) as total_credit
    FROM chart_of_accounts coa
    LEFT JOIN gl_transactions t ON t.account_id = coa.id
    LEFT JOIN gl_headers h ON t.header_id = h.id
    GROUP BY coa.code, coa.name
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
  WHERE EXISTS (
    -- Include accounts that have any transactions
    SELECT 1 FROM gl_transactions t2
    JOIN gl_headers h2 ON t2.header_id = h2.id
    JOIN chart_of_accounts coa2 ON t2.account_id = coa2.id
    WHERE coa2.code = ab.code
  )
  ORDER BY ab.code;
END;
$$;