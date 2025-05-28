/*
  # Fix Transaction Status and Interparty Transfer Issues

  1. Changes
    - Update set_voucher_number function to set status to 'posted' by default
    - Add function to get transaction type ID by code
    - Ensure IPT and IPTC transaction types exist
*/

-- Update set_voucher_number function to set status to 'posted' by default
CREATE OR REPLACE FUNCTION set_voucher_number()
RETURNS trigger AS $$
DECLARE
  v_trans_type_code text;
  v_next_number text;
BEGIN
  -- Get transaction type code
  SELECT transaction_type_code 
  INTO v_trans_type_code
  FROM tbl_trans_type
  WHERE type_id = NEW.type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction type not found';
  END IF;

  -- Get next number and pad with zeros
  v_next_number := LPAD(nextval('voucher_number_seq')::text, 6, '0');

  -- Set voucher number
  NEW.voucher_no := v_trans_type_code || v_next_number;
  
  -- Set status to posted by default if not specified
  IF NEW.status IS NULL THEN
    NEW.status := 'posted';
  END IF;
  
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

-- Create a function to get transaction type ID by code
CREATE OR REPLACE FUNCTION get_transaction_type_id(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_type_id uuid;
BEGIN
  SELECT type_id INTO v_type_id
  FROM tbl_trans_type
  WHERE transaction_type_code = p_code;
  
  RETURN v_type_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_transaction_type_id(text) TO authenticated;

-- Ensure IPT and IPTC transaction types exist
INSERT INTO tbl_trans_type (transaction_type_code, description)
VALUES 
  ('IPT', 'Inter Party Transfer'),
  ('IPTC', 'Inter Party Transfer with Commission')
ON CONFLICT (transaction_type_code) 
DO UPDATE SET description = EXCLUDED.description;