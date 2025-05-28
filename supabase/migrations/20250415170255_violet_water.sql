/*
  # Fix Transaction Management

  1. Changes
    - Drop existing policies
    - Create new simplified policies
    - Add function to check transaction permissions
    - Update admin role permissions
*/

-- Drop existing policies and functions
DO $$ 
BEGIN
    -- Drop policies if they exist
    DROP POLICY IF EXISTS "allow_transaction_management" ON gl_headers;
    DROP POLICY IF EXISTS "allow_transaction_details_management" ON gl_transactions;
    DROP POLICY IF EXISTS "enable_transaction_management" ON gl_headers;
    DROP POLICY IF EXISTS "enable_transaction_details_management" ON gl_transactions;
    
    -- Drop function if exists
    DROP FUNCTION IF EXISTS can_manage_transactions();
END $$;

-- Create function to check transaction permissions
CREATE OR REPLACE FUNCTION can_manage_transactions()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = auth.uid()
    AND (
      r.name = 'admin' 
      OR (r.permissions->>'transactions')::boolean = true
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new policies with unique names
CREATE POLICY "transaction_management_policy_v1"
ON gl_headers
FOR ALL
TO authenticated
USING (can_manage_transactions())
WITH CHECK (can_manage_transactions());

CREATE POLICY "transaction_details_management_policy_v1"
ON gl_transactions
FOR ALL
TO authenticated
USING (can_manage_transactions())
WITH CHECK (can_manage_transactions());

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