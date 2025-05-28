/*
  # Fix Transaction Management

  1. Changes
    - Drop existing policies
    - Create new simplified policies
    - Fix voucher number generation
    - Add proper triggers and constraints
*/

-- First ensure the CASH transaction type exists
DO $$ 
DECLARE
  v_trans_type_id uuid;
BEGIN
  -- Insert or update CASH transaction type
  INSERT INTO tbl_trans_type (
    transaction_type_code,
    description,
    voucher_no_prefix
  )
  VALUES (
    'CASH',
    'Cash Transaction',
    700000
  )
  ON CONFLICT (transaction_type_code) DO UPDATE
  SET description = EXCLUDED.description,
      voucher_no_prefix = EXCLUDED.voucher_no_prefix
  RETURNING id INTO v_trans_type_id;

  -- Verify the transaction type exists
  IF v_trans_type_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create or update CASH transaction type';
  END IF;
END $$;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their transactions" ON gl_headers;
DROP POLICY IF EXISTS "Users can create transactions" ON gl_headers;
DROP POLICY IF EXISTS "Users can view their transaction details" ON gl_transactions;
DROP POLICY IF EXISTS "Users can create transaction details" ON gl_transactions;

-- Create simplified policies for gl_headers
CREATE POLICY "enable_all_for_authenticated"
ON gl_headers
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Create simplified policies for gl_transactions
CREATE POLICY "enable_all_for_authenticated"
ON gl_transactions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Drop existing trigger first
DROP TRIGGER IF EXISTS before_insert_set_voucher_number ON gl_headers;
DROP TRIGGER IF EXISTS before_insert_update_transaction ON gl_transactions;

-- Now we can safely drop and recreate the functions
DROP FUNCTION IF EXISTS set_voucher_number() CASCADE;
DROP FUNCTION IF EXISTS set_transaction_metadata() CASCADE;

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
  
  -- Set metadata
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  NEW.updated_by := auth.uid();
  NEW.created_at := COALESCE(NEW.created_at, CURRENT_TIMESTAMP);
  NEW.updated_at := CURRENT_TIMESTAMP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to set metadata for transactions
CREATE OR REPLACE FUNCTION set_transaction_metadata()
RETURNS trigger AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  NEW.updated_by := auth.uid();
  NEW.created_at := COALESCE(NEW.created_at, CURRENT_TIMESTAMP);
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for voucher number generation
CREATE TRIGGER before_insert_set_voucher_number
  BEFORE INSERT ON gl_headers
  FOR EACH ROW
  EXECUTE FUNCTION set_voucher_number();

-- Create trigger for transaction metadata
CREATE TRIGGER before_insert_update_transaction
  BEFORE INSERT OR UPDATE ON gl_transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_transaction_metadata();