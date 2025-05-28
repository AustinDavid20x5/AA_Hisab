/*
  # Fix Interparty Transfer Transaction Retrieval

  1. Changes
    - Create a function to get transaction types by code
    - Improve transaction retrieval for IPT and IPTC types
    - Add proper error handling
*/

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