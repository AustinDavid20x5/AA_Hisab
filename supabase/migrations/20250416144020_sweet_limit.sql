/*
  # Update Transaction Type Codes

  1. Changes
    - Update MNGCHK to MNGC
    - Update BNKTRF to BNKT
    - Update any existing transactions to use new codes
*/

-- First update the transaction type codes
UPDATE tbl_trans_type
SET transaction_type_code = 'MNGC'
WHERE transaction_type_code = 'MNGCHK';

UPDATE tbl_trans_type
SET transaction_type_code = 'BNKT'
WHERE transaction_type_code = 'BNKTRF';

-- Insert transaction types if they don't exist
INSERT INTO tbl_trans_type (transaction_type_code, description)
VALUES 
  ('MNGC', 'Manager Cheque'),
  ('BNKT', 'Bank Transfer')
ON CONFLICT (transaction_type_code) 
DO UPDATE SET description = EXCLUDED.description;