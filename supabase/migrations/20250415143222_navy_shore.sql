/*
  # Update Currency Management
  
  1. Changes
    - Modify currency code length to support 4 characters (e.g., USDT)
    - Add note column for exchange rate calculation method
*/

-- Modify the code column to allow 4 characters
ALTER TABLE currencies 
  ALTER COLUMN code TYPE character(4);

-- Add column for exchange rate calculation note
ALTER TABLE currencies
  ADD COLUMN IF NOT EXISTS exchange_rate_note text DEFAULT 'multiply';

-- Update existing rows to set default exchange rate note
UPDATE currencies 
SET exchange_rate_note = 
  CASE 
    WHEN is_base THEN NULL 
    ELSE 'multiply'
  END;

-- Add check constraint to ensure exchange_rate_note is valid
ALTER TABLE currencies
  ADD CONSTRAINT valid_exchange_rate_note 
  CHECK (exchange_rate_note IN ('multiply', 'divide') OR (is_base AND exchange_rate_note IS NULL));