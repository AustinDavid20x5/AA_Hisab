/*
  # Fix Transaction Management

  1. Changes
    - Drop existing policies
    - Create new simplified policies with unique names
    - Fix voucher number generation
    - Add proper triggers and constraints
*/

-- Drop existing policies with unique names
DROP POLICY IF EXISTS "gl_headers_select_policy" ON gl_headers;
DROP POLICY IF EXISTS "gl_headers_insert_policy" ON gl_headers;
DROP POLICY IF EXISTS "gl_headers_update_policy" ON gl_headers;
DROP POLICY IF EXISTS "gl_headers_delete_policy" ON gl_headers;

DROP POLICY IF EXISTS "gl_transactions_select_policy" ON gl_transactions;
DROP POLICY IF EXISTS "gl_transactions_insert_policy" ON gl_transactions;
DROP POLICY IF EXISTS "gl_transactions_update_policy" ON gl_transactions;
DROP POLICY IF EXISTS "gl_transactions_delete_policy" ON gl_transactions;

-- Drop existing triggers and functions
DROP TRIGGER IF EXISTS before_insert_set_voucher_number ON gl_headers;
DROP TRIGGER IF EXISTS before_insert_update_transaction ON gl_transactions;
DROP FUNCTION IF EXISTS set_voucher_number();
DROP FUNCTION IF EXISTS set_transaction_metadata();

-- Create simplified policies for gl_headers with unique names
CREATE POLICY "gl_headers_select_policy"
ON gl_headers FOR SELECT
TO authenticated
USING (created_by = auth.uid());

CREATE POLICY "gl_headers_insert_policy"
ON gl_headers FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create simplified policies for gl_transactions with unique names
CREATE POLICY "gl_transactions_select_policy"
ON gl_transactions FOR SELECT
TO authenticated
USING (header_id IN (
  SELECT id FROM gl_headers WHERE created_by = auth.uid()
));

CREATE POLICY "gl_transactions_insert_policy"
ON gl_transactions FOR INSERT
TO authenticated
WITH CHECK (true);

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
  
  -- Set created_by
  NEW.created_by := auth.uid();
  NEW.updated_by := auth.uid();
  NEW.created_at := CURRENT_TIMESTAMP;
  NEW.updated_at := CURRENT_TIMESTAMP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for voucher number generation
CREATE TRIGGER before_insert_set_voucher_number
  BEFORE INSERT ON gl_headers
  FOR EACH ROW
  EXECUTE FUNCTION set_voucher_number();

-- Create function to set metadata for transactions
CREATE OR REPLACE FUNCTION set_transaction_metadata()
RETURNS trigger AS $$
BEGIN
  NEW.created_by := auth.uid();
  NEW.updated_by := auth.uid();
  NEW.created_at := CURRENT_TIMESTAMP;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for transaction metadata
CREATE TRIGGER before_insert_transaction
  BEFORE INSERT ON gl_transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_transaction_metadata();