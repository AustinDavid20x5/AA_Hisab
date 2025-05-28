/*
  # Fix Transaction Management Permissions

  1. Changes
    - Update RLS policies for transaction management
    - Add transaction permissions to admin role
    - Ensure CASH transaction type exists
*/

-- First ensure RLS is enabled
ALTER TABLE gl_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can manage their transactions" ON gl_headers;
DROP POLICY IF EXISTS "Users can manage their transaction details" ON gl_transactions;
DROP POLICY IF EXISTS "enable_transaction_management" ON gl_headers;
DROP POLICY IF EXISTS "enable_transaction_details_management" ON gl_transactions;

-- Create simplified policies for gl_headers
CREATE POLICY "allow_transaction_management"
ON gl_headers
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Create simplified policies for gl_transactions
CREATE POLICY "allow_transaction_details_management"
ON gl_transactions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Update admin role permissions
UPDATE roles
SET permissions = jsonb_set(
  permissions,
  '{transactions}',
  'true'::jsonb,
  true
)
WHERE name = 'admin';

-- Ensure CASH transaction type exists with correct permissions
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