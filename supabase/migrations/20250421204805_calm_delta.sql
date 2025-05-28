/*
  # Fix ambiguous id reference in get_interparty_transfers function

  1. Changes
    - Drop existing function if it exists
    - Create new function with properly qualified column references
    - Add proper table aliases to avoid ambiguity
    - Ensure all column references are properly qualified

  2. Function Parameters
    - p_start_date: date - Start date for filtering transactions
    - p_end_date: date - End date for filtering transactions

  3. Return Values
    - id: The transaction header ID
    - voucher_no: The transaction voucher number
    - transaction_date: The date of the transaction
    - description: Transaction description
    - status: Transaction status
    - from_partner_id: ID of the sending partner
    - from_partner_name: Name of the sending partner
    - to_partner_id: ID of the receiving partner
    - to_partner_name: Name of the receiving partner
    - amount: Transaction amount
    - commission: Commission amount (if any)
*/

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS get_interparty_transfers(p_start_date date, p_end_date date);

-- Create the function with properly qualified column references
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
  WITH transaction_details AS (
    SELECT 
      h.id AS header_id,
      h.voucher_no,
      h.transaction_date,
      h.description,
      h.status,
      -- Get the "from" partner (credit entry)
      (SELECT t.account_id 
       FROM gl_transactions t 
       WHERE t.header_id = h.id 
         AND t.credit > 0 
         AND t.account_id IN (
           SELECT coa.id 
           FROM chart_of_accounts coa
           INNER JOIN subcategories s ON s.id = coa.subcategory_id
           WHERE s.name = 'Business Partner'
         )
       LIMIT 1) AS from_partner_id,
      -- Get the "to" partner (debit entry)
      (SELECT t.account_id 
       FROM gl_transactions t 
       WHERE t.header_id = h.id 
         AND t.debit > 0 
         AND t.account_id IN (
           SELECT coa.id 
           FROM chart_of_accounts coa
           INNER JOIN subcategories s ON s.id = coa.subcategory_id
           WHERE s.name = 'Business Partner'
         )
       LIMIT 1) AS to_partner_id,
      -- Get the transfer amount (credit amount from "from" partner)
      (SELECT t.credit 
       FROM gl_transactions t 
       WHERE t.header_id = h.id 
         AND t.credit > 0 
         AND t.account_id IN (
           SELECT coa.id 
           FROM chart_of_accounts coa
           INNER JOIN subcategories s ON s.id = coa.subcategory_id
           WHERE s.name = 'Business Partner'
         )
       LIMIT 1) AS transfer_amount,
      -- Get the commission amount
      (SELECT t.credit 
       FROM gl_transactions t 
       WHERE t.header_id = h.id 
         AND t.account_id = (
           SELECT coa.id 
           FROM chart_of_accounts coa 
           WHERE coa.code = '0000000005'
         )
       LIMIT 1) AS commission_amount
    FROM gl_headers h
    WHERE h.transaction_date BETWEEN p_start_date AND p_end_date
      AND h.status = 'posted'
      AND h.voucher_no LIKE 'IPT%'
  )
  SELECT 
    td.header_id,
    td.voucher_no,
    td.transaction_date,
    td.description,
    td.status,
    td.from_partner_id,
    fp.name AS from_partner_name,
    td.to_partner_id,
    tp.name AS to_partner_name,
    td.transfer_amount AS amount,
    COALESCE(td.commission_amount / 2, 0) AS commission
  FROM transaction_details td
  LEFT JOIN chart_of_accounts fp ON fp.id = td.from_partner_id
  LEFT JOIN chart_of_accounts tp ON tp.id = td.to_partner_id
  WHERE td.from_partner_id IS NOT NULL 
    AND td.to_partner_id IS NOT NULL
  ORDER BY td.transaction_date DESC, td.voucher_no DESC;
END;
$$;