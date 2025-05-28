/*
  # Set default status for gl_headers table

  1. Changes
    - Update status column to have default value of 'posted'
    - Keep existing check constraint for valid status values
*/

-- First drop the existing check constraint if it exists
ALTER TABLE gl_headers
  DROP CONSTRAINT IF EXISTS gl_headers_status_check;

-- Update the status column to set default value and recreate check constraint
ALTER TABLE gl_headers
  ALTER COLUMN status SET DEFAULT 'posted',
  ADD CONSTRAINT gl_headers_status_check 
  CHECK (status IN ('draft', 'posted', 'void'));

-- Update any existing null status values to 'posted'
UPDATE gl_headers 
SET status = 'posted' 
WHERE status IS NULL;