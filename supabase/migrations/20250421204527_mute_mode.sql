/*
  # Create function to get all interparty transfer transactions
  
  1. New Function
    - get_interparty_transfers: Returns all IPT and IPTC transactions
    - Filters by date range
    - Returns complete transaction details
*/

-- Create function to get all interparty transfers
CREATE OR REPLACE FUNCTION get_interparty_transfers(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  id uuid,
  voucher_no text,
  transaction_date date,
  description text,
  status text,
  from_partner_id uuid,
  from_partner_name text,
  to_partner_id uuid,
  to_partner_name text,
  amount numeric,
  commission numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH transaction_data AS (
    SELECT 
      h.id,
      h.voucher_no,
      h.transaction_date,
      h.description,
      h.status,
      -- Find the "from" partner (credit entry)
      (SELECT t.account_id 
       FROM gl_transactions t 
       WHERE t.header_id = h.id 
       AND t.credit > 0 
       AND t.account_id != '00000000-0000-0000-0000-000000000000'::uuid
       LIMIT 1) as from_partner_id,
      -- Find the "to" partner (debit entry)
      (SELECT t.account_id 
       FROM gl_transactions t 
       WHERE t.header_id = h.id 
       AND t.debit > 0 
       AND t.account_id != '00000000-0000-0000-0000-000000000000'::uuid
       LIMIT 1) as to_partner_id,
      -- Get the transaction amount (from the credit entry)
      (SELECT t.credit 
       FROM gl_transactions t 
       WHERE t.header_id = h.id 
       AND t.credit > 0 
       AND t.account_id != '00000000-0000-0000-0000-000000000000'::uuid
       LIMIT 1) as amount,
      -- Get the commission amount
      (SELECT t.credit 
       FROM gl_transactions t 
       WHERE t.header_id = h.id 
       AND t.account_id = '00000000-0000-0000-0000-000000000000'::uuid
       LIMIT 1) as commission
    FROM gl_headers h
    WHERE h.voucher_no LIKE 'IPT%'
      AND h.status = 'posted'
      AND h.transaction_date BETWEEN p_start_date AND p_end_date
  )
  SELECT 
    td.id,
    td.voucher_no,
    td.transaction_date,
    td.description,
    td.status,
    td.from_partner_id,
    fp.name as from_partner_name,
    td.to_partner_id,
    tp.name as to_partner_name,
    td.amount,
    COALESCE(td.commission, 0) as commission
  FROM transaction_data td
  LEFT JOIN chart_of_accounts fp ON td.from_partner_id = fp.id
  LEFT JOIN chart_of_accounts tp ON td.to_partner_id = tp.id
  WHERE td.from_partner_id IS NOT NULL
    AND td.to_partner_id IS NOT NULL
  ORDER BY td.transaction_date DESC, td.voucher_no DESC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_interparty_transfers(date, date) TO authenticated;