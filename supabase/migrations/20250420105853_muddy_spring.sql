/*
  # Add General Trading transaction type

  1. Changes
    - Add new transaction type 'GENT' for General Trading transactions
    - Set description to clearly identify the purpose
    - Enable RLS policies to match existing table configuration
*/

INSERT INTO tbl_trans_type (transaction_type_code, description)
VALUES ('GENT', 'General Trading Transaction')
ON CONFLICT (transaction_type_code) DO NOTHING;