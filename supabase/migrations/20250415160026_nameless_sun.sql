/*
  # Fix Transaction Permissions

  1. Changes
    - Update RLS policies for gl_headers and gl_transactions
    - Add proper user role checks
    - Ensure transaction type exists
*/

-- First ensure RLS is enabled
ALTER TABLE gl_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can manage their transactions" ON gl_headers;
DROP POLICY IF EXISTS "Users can manage their transaction details" ON gl_transactions;

-- Create function to check if user has transaction permissions
CREATE OR REPLACE FUNCTION can_manage_transactions(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM profiles p
    JOIN roles r ON p.role_id = r.id
    WHERE p.id = user_id
    AND (
      r.name = 'admin' 
      OR (r.permissions->>'transactions')::boolean = true
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add policies for gl_headers
CREATE POLICY "enable_transaction_management"
ON gl_headers
FOR ALL
TO authenticated
USING (
  can_manage_transactions(auth.uid())
)
WITH CHECK (
  can_manage_transactions(auth.uid())
);

-- Add policies for gl_transactions
CREATE POLICY "enable_transaction_details_management"
ON gl_transactions
FOR ALL
TO authenticated
USING (
  can_manage_transactions(auth.uid())
)
WITH CHECK (
  can_manage_transactions(auth.uid())
);

-- Update admin role permissions to include transactions
UPDATE roles 
SET permissions = jsonb_set(
  permissions,
  '{transactions}',
  'true'::jsonb
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