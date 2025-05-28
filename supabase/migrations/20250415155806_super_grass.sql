/*
  # Fix Transaction Type Policies

  1. Changes
    - Add RLS policies for transaction types
    - Ensure CASH transaction type exists
*/

-- First ensure the CASH transaction type exists
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
    voucher_no_prefix = EXCLUDED.voucher_no_prefix;

-- Update RLS policies for gl_headers
DROP POLICY IF EXISTS "Users can manage their transactions" ON gl_headers;
CREATE POLICY "Users can manage their transactions"
ON gl_headers
FOR ALL
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- Update RLS policies for gl_transactions
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