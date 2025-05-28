/*
  # Fix get_interparty_transfers function type mismatch

  1. Changes
    - Drop and recreate get_interparty_transfers function with correct return types
    - Cast character varying columns to text to ensure type consistency
    - Ensure all return columns match expected types in the application

  2. Notes
    - Function returns transaction details for interparty transfers
    - All character varying fields are cast to text to match application expectations
*/

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS get_interparty_transfers;

-- Recreate the function with correct return types
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
AS $$
BEGIN
  RETURN QUERY
  WITH transactions AS (
    SELECT 
      h.id,
      h.voucher_no::text,  -- Cast to text
      h.transaction_date,
      h.description,
      h.status::text,      -- Cast to text
      (
        SELECT t.account_id
        FROM gl_transactions t
        WHERE t.header_id = h.id
        AND t.credit > 0
        AND t.account_id IN (
          SELECT coa.id
          FROM chart_of_accounts coa
          JOIN subcategories s ON s.id = coa.subcategory_id
          WHERE s.name = 'Business Partner'
        )
        LIMIT 1
      ) as from_partner_id,
      (
        SELECT coa.name::text  -- Cast to text
        FROM gl_transactions t
        JOIN chart_of_accounts coa ON coa.id = t.account_id
        WHERE t.header_id = h.id
        AND t.credit > 0
        AND t.account_id IN (
          SELECT coa2.id
          FROM chart_of_accounts coa2
          JOIN subcategories s ON s.id = coa2.subcategory_id
          WHERE s.name = 'Business Partner'
        )
        LIMIT 1
      ) as from_partner_name,
      (
        SELECT t.account_id
        FROM gl_transactions t
        WHERE t.header_id = h.id
        AND t.debit > 0
        AND t.account_id IN (
          SELECT coa.id
          FROM chart_of_accounts coa
          JOIN subcategories s ON s.id = coa.subcategory_id
          WHERE s.name = 'Business Partner'
        )
        LIMIT 1
      ) as to_partner_id,
      (
        SELECT coa.name::text  -- Cast to text
        FROM gl_transactions t
        JOIN chart_of_accounts coa ON coa.id = t.account_id
        WHERE t.header_id = h.id
        AND t.debit > 0
        AND t.account_id IN (
          SELECT coa2.id
          FROM chart_of_accounts coa2
          JOIN subcategories s ON s.id = coa2.subcategory_id
          WHERE s.name = 'Business Partner'
        )
        LIMIT 1
      ) as to_partner_name,
      (
        SELECT t.credit
        FROM gl_transactions t
        WHERE t.header_id = h.id
        AND t.credit > 0
        AND t.account_id IN (
          SELECT coa.id
          FROM chart_of_accounts coa
          JOIN subcategories s ON s.id = coa.subcategory_id
          WHERE s.name = 'Business Partner'
        )
        LIMIT 1
      ) as amount,
      COALESCE(
        (
          SELECT t.credit / 2
          FROM gl_transactions t
          WHERE t.header_id = h.id
          AND t.account_id = (SELECT id FROM chart_of_accounts WHERE code = '0000000005')
          LIMIT 1
        ),
        0
      ) as commission
    FROM gl_headers h
    WHERE h.status = 'posted'
    AND h.transaction_date BETWEEN p_start_date AND p_end_date
    AND h.voucher_no LIKE 'IPT%'
  )
  SELECT 
    t.id,
    t.voucher_no,
    t.transaction_date,
    t.description,
    t.status,
    t.from_partner_id,
    t.from_partner_name,
    t.to_partner_id,
    t.to_partner_name,
    t.amount,
    t.commission
  FROM transactions t
  WHERE t.from_partner_id IS NOT NULL
  AND t.to_partner_id IS NOT NULL
  ORDER BY t.transaction_date DESC, t.voucher_no DESC;
END;
$$;