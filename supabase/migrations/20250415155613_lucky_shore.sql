/*
  # Fix Cash Entry Transaction Issues

  1. Changes
    - Add function to generate voucher numbers
    - Add RLS policies for gl_headers and gl_transactions
    - Add trigger for voucher number generation
*/

-- Function to generate voucher number
CREATE OR REPLACE FUNCTION generate_voucher_number(p_trans_type_code text)
RETURNS text AS $$
DECLARE
  v_prefix integer;
  v_next_number integer;
  v_voucher_no text;
BEGIN
  -- Get prefix from transaction type
  SELECT voucher_no_prefix INTO v_prefix
  FROM tbl_trans_type
  WHERE transaction_type_code = p_trans_type_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction type % not found', p_trans_type_code;
  END IF;

  -- Get next number
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(voucher_no FROM LENGTH(p_trans_type_code) + 1) AS integer)),
    v_prefix
  ) + 1
  INTO v_next_number
  FROM gl_headers gh
  JOIN tbl_trans_type tt ON gh.transaction_type_id = tt.id
  WHERE tt.transaction_type_code = p_trans_type_code;

  -- Generate voucher number
  v_voucher_no := p_trans_type_code || v_next_number::text;

  RETURN v_voucher_no;
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies for gl_headers
DROP POLICY IF EXISTS "Users can manage their transactions" ON gl_headers;
CREATE POLICY "Users can manage their transactions"
ON gl_headers
FOR ALL
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- Add RLS policies for gl_transactions
DROP POLICY IF EXISTS "Users can manage their transaction details" ON gl_transactions;
CREATE POLICY "Users can manage their transaction details"
ON gl_transactions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM gl_headers
    WHERE gl_headers.id = gl_transactions.header_id
    AND gl_headers.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM gl_headers
    WHERE gl_headers.id = gl_transactions.header_id
    AND gl_headers.created_by = auth.uid()
  )
);

-- Add trigger to generate voucher number
CREATE OR REPLACE FUNCTION set_voucher_number()
RETURNS trigger AS $$
DECLARE
  v_trans_type_code text;
BEGIN
  -- Get transaction type code
  SELECT transaction_type_code INTO v_trans_type_code
  FROM tbl_trans_type
  WHERE id = NEW.transaction_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction type not found';
  END IF;

  -- Generate and set voucher number
  NEW.voucher_no := generate_voucher_number(v_trans_type_code);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS before_insert_set_voucher_number ON gl_headers;
CREATE TRIGGER before_insert_set_voucher_number
  BEFORE INSERT ON gl_headers
  FOR EACH ROW
  EXECUTE FUNCTION set_voucher_number();