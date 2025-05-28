/*
  # Add Trial Balance Function
  
  1. Changes
    - Create function to calculate trial balance
    - Handle debit and credit calculations
    - Return formatted results
*/

-- Create function to get trial balance
CREATE OR REPLACE FUNCTION get_trial_balance()
RETURNS TABLE (
  code text,
  name text,
  debit numeric,
  credit numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH account_balances AS (
    SELECT 
      coa.code,
      coa.name,
      COALESCE(SUM(CASE WHEN gt.debit > 0 THEN gt.debit ELSE 0 END), 0) as total_debit,
      COALESCE(SUM(CASE WHEN gt.credit > 0 THEN gt.credit ELSE 0 END), 0) as total_credit
    FROM chart_of_accounts coa
    LEFT JOIN gl_transactions gt ON gt.account_id = coa.id
    LEFT JOIN gl_headers gh ON gt.header_id = gh.id AND gh.status = 'posted'
    GROUP BY coa.code, coa.name
  )
  SELECT 
    ab.code,
    ab.name,
    CASE 
      WHEN (ab.total_debit - ab.total_credit) > 0 THEN (ab.total_debit - ab.total_credit)
      ELSE 0
    END as debit,
    CASE 
      WHEN (ab.total_credit - ab.total_debit) > 0 THEN (ab.total_credit - ab.total_debit)
      ELSE 0
    END as credit
  FROM account_balances ab
  WHERE ab.total_debit > 0 OR ab.total_credit > 0
  ORDER BY ab.code;
END;
$$ LANGUAGE plpgsql;