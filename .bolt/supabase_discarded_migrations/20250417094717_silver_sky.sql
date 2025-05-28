/*
  # Ensure AED Currency Exists
  
  1. Changes
    - Ensure AED currency exists with proper settings
    - Add helpful index for currency code lookups
*/

-- Ensure AED currency exists
INSERT INTO currencies (
  code,
  name,
  symbol,
  rate,
  is_base,
  exchange_rate_note
)
VALUES (
  'AED',
  'UAE Dirham',
  'د.إ',
  1.0000,
  true,
  NULL
)
ON CONFLICT (code) 
DO UPDATE SET 
  rate = 1.0000,
  is_base = true,
  exchange_rate_note = NULL;

-- Add index for faster currency code lookups
CREATE INDEX IF NOT EXISTS idx_currencies_code
  ON currencies(code);