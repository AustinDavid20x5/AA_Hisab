/*
  # Fix Transaction Creation Issues

  1. Changes
    - Drop existing complex policies
    - Create simplified RLS policies
    - Fix voucher number generation
    - Add proper triggers and constraints
*/

-- Drop existing policies
DROP POLICY IF EXISTS "enable_all_access_for_authenticated" ON gl_headers;
DROP POLICY IF EXISTS "enable_all_access_for_authenticated" ON gl_transactions;

-- Ensure RLS is enabled
ALTER TABLE gl_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_transactions ENABLE ROW LEVEL SECURITY;

-- Create simplified policies for gl_headers
CREATE POLICY "enable_read_for_authenticated_users"
ON gl_headers FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "enable_insert_for_authenticated_users"
ON gl_headers FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "enable_update_for_authenticated_users"
ON gl_headers FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "enable_delete_for_authenticated_users"
ON gl_headers FOR DELETE
TO authenticated
USING (true);

-- Create simplified policies for gl_transactions
CREATE POLICY "enable_read_for_authenticated_users"
ON gl_transactions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "enable_insert_for_authenticated_users"
ON gl_transactions FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "enable_update_for_authenticated_users"
ON gl_transactions FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "enable_delete_for_authenticated_users"
ON gl_transactions FOR DELETE
TO authenticated
USING (true);

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS before_insert_set_voucher_number ON gl_headers;
DROP FUNCTION IF EXISTS set_voucher_number();

-- Create improved voucher number generation function
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
  
  -- Set created_by if not set
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  -- Set updated_by
  NEW.updated_by := auth.uid();
  
  -- Set timestamps
  IF NEW.created_at IS NULL THEN
    NEW.created_at := CURRENT_TIMESTAMP;
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for voucher number generation
CREATE TRIGGER before_insert_set_voucher_number
  BEFORE INSERT ON gl_headers
  FOR EACH ROW
  EXECUTE FUNCTION set_voucher_number();

-- Add trigger for gl_transactions to set user IDs and timestamps
CREATE OR REPLACE FUNCTION set_transaction_metadata()
RETURNS trigger AS $$
BEGIN
  -- Set created_by if not set
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  -- Set updated_by
  NEW.updated_by := auth.uid();
  
  -- Set timestamps
  IF NEW.created_at IS NULL THEN
    NEW.created_at := CURRENT_TIMESTAMP;
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER before_insert_update_transaction
  BEFORE INSERT OR UPDATE ON gl_transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_transaction_metadata();