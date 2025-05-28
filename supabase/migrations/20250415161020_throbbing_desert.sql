/*
  # Fix Transaction Management Permissions

  1. Changes
    - Drop existing complex policies
    - Create simple RLS policies for transactions
    - Update trigger for voucher number generation
*/

-- Drop existing policies
DROP POLICY IF EXISTS "allow_transaction_management" ON gl_headers;
DROP POLICY IF EXISTS "allow_transaction_details_management" ON gl_transactions;
DROP POLICY IF EXISTS "enable_transaction_management" ON gl_headers;
DROP POLICY IF EXISTS "enable_transaction_details_management" ON gl_transactions;

-- Drop existing function
DROP FUNCTION IF EXISTS can_manage_transactions();

-- Create simple policies for gl_headers
CREATE POLICY "enable_all_access_for_authenticated"
ON gl_headers
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Create simple policies for gl_transactions
CREATE POLICY "enable_all_access_for_authenticated"
ON gl_transactions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Update trigger function for voucher number generation
CREATE OR REPLACE FUNCTION set_voucher_number()
RETURNS trigger AS $$
DECLARE
  v_trans_type_code text;
  v_prefix integer;
  v_next_number integer;
BEGIN
  -- Get transaction type code and prefix
  SELECT transaction_type_code, voucher_no_prefix 
  INTO v_trans_type_code, v_prefix
  FROM tbl_trans_type
  WHERE id = NEW.transaction_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction type not found';
  END IF;

  -- Get next number
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(voucher_no FROM LENGTH(v_trans_type_code) + 1) AS integer)),
    v_prefix
  ) + 1
  INTO v_next_number
  FROM gl_headers gh
  JOIN tbl_trans_type tt ON gh.transaction_type_id = tt.id
  WHERE tt.transaction_type_code = v_trans_type_code;

  -- Set voucher number
  NEW.voucher_no := v_trans_type_code || v_next_number::text;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;