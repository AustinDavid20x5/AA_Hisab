/*
  # Add CASH transaction type

  1. New Data
    - Adds CASH transaction type if it doesn't exist
    - Sets description for the CASH transaction type

  2. Changes
    - Ensures CASH transaction type exists in tbl_trans_type table
    - Uses safe INSERT that checks for existence first
*/

DO $$ 
BEGIN
  -- Only insert if the CASH transaction type doesn't exist
  IF NOT EXISTS (
    SELECT 1 
    FROM tbl_trans_type 
    WHERE transaction_type_code = 'CASH'
  ) THEN
    INSERT INTO tbl_trans_type (
      transaction_type_code,
      description
    ) VALUES (
      'CASH',
      'Cash Transaction'
    );
  END IF;
END $$;