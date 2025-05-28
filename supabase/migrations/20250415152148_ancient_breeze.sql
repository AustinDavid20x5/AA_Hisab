/*
  # Create Transaction Types Table and Setup

  1. New Table
    - `tbl_trans_type` for storing transaction type definitions
    - Auto-incrementing voucher number prefixes
    - Unique constraints on type code

  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create transaction types table
CREATE TABLE IF NOT EXISTS tbl_trans_type (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type_code text NOT NULL UNIQUE,
  description text NOT NULL,
  voucher_no_prefix integer NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE tbl_trans_type ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "enable_read_for_authenticated_users"
ON tbl_trans_type FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "enable_insert_for_authenticated_users"
ON tbl_trans_type FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "enable_update_for_authenticated_users"
ON tbl_trans_type FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "enable_delete_for_authenticated_users"
ON tbl_trans_type FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');

-- Insert initial data
INSERT INTO tbl_trans_type (transaction_type_code, description, voucher_no_prefix) VALUES
('JV', 'Journal Voucher', 100000),
('GENTRD', 'General Trading', 200000),
('IPT', 'Inter Party Transfer', 300000),
('IPTCOM', 'Inter Party Transfer with Commission', 400000),
('MNGCHK', 'Manager Cheque', 500000),
('BNKTRF', 'Bank Transfer', 600000),
('CASH', 'Cash Transaction', 700000)
ON CONFLICT (transaction_type_code) DO NOTHING;