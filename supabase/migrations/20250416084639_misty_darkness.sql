-- Drop existing foreign key constraints
ALTER TABLE gl_headers 
  DROP CONSTRAINT IF EXISTS gl_headers_transaction_type_id_fkey,
  DROP CONSTRAINT IF EXISTS gl_headers_type_id_fkey;

-- Drop old columns
ALTER TABLE gl_headers 
  DROP COLUMN IF EXISTS transaction_type_id,
  DROP COLUMN IF EXISTS "transaction_type_id uuid",
  DROP COLUMN IF EXISTS type_id;

-- Add new type_id column
ALTER TABLE gl_headers 
  ADD COLUMN type_id uuid;

-- Create or update tbl_trans_type table
CREATE TABLE IF NOT EXISTS tbl_trans_type (
  type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type_code text NOT NULL UNIQUE,
  description text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert CASH transaction type if it doesn't exist
INSERT INTO tbl_trans_type (transaction_type_code, description)
VALUES ('CASH', 'Cash Transaction')
ON CONFLICT (transaction_type_code) DO NOTHING;

-- Add foreign key constraint
ALTER TABLE gl_headers
  ADD CONSTRAINT gl_headers_type_id_fkey 
  FOREIGN KEY (type_id) 
  REFERENCES tbl_trans_type(type_id)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Add NOT NULL constraint after ensuring data exists
ALTER TABLE gl_headers
  ALTER COLUMN type_id SET NOT NULL;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_gl_headers_type_id
  ON gl_headers(type_id);

CREATE INDEX IF NOT EXISTS idx_tbl_trans_type_code
  ON tbl_trans_type(transaction_type_code);

-- Enable RLS
ALTER TABLE tbl_trans_type ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "trans_type_select_policy_v5"
ON tbl_trans_type FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "trans_type_insert_policy_v5"
ON tbl_trans_type FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "trans_type_update_policy_v5"
ON tbl_trans_type FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "trans_type_delete_policy_v5"
ON tbl_trans_type FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');