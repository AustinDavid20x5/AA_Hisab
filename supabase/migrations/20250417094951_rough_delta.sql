/*
  # Add Index for Currency Code Lookups
  
  1. Changes
    - Add index on currencies.code column for faster lookups
*/

-- Add index for faster currency code lookups
CREATE INDEX IF NOT EXISTS idx_currencies_code
  ON currencies(code);