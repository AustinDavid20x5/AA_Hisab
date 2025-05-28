/*
  # Fix Transaction Management

  1. Changes
    - Drop existing policies
    - Create new simplified policies
    - Update admin role permissions
    - Add transaction management function
*/

-- Drop existing policies
DROP POLICY IF EXISTS "enable_transaction_management" ON gl_headers;
DROP POLICY IF EXISTS "enable_transaction_details_management" ON gl_transactions;

-- Create function to check transaction permissions
CREATE OR REPLACE FUNCTION can_manage_transactions()
RETURNS boolean AS $$
BEGIN
  -- Allow all authenticated users to manage transactions
  RETURN auth.role() = 'authenticated';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create policies for gl_headers
CREATE POLICY "allow_transaction_management"
ON gl_headers
FOR ALL
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Create policies for gl_transactions
CREATE POLICY "allow_transaction_details_management"
ON gl_transactions
FOR ALL
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Update admin role permissions
UPDATE roles
SET permissions = jsonb_build_object(
  'users', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'roles', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'profiles', jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true),
  'transactions', true,
  'all', true
)
WHERE name = 'admin';

-- Ensure CASH transaction type exists
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