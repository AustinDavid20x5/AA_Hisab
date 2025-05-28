/*
  # Update Chart of Accounts Schema

  1. Changes
    - Remove type column
    - Add zakat_eligible column
    - Add is_cashbook column
    - Add currency_id column (optional, only for cashbook accounts)
    - Update constraints and foreign keys
*/

-- First modify the chart_of_accounts table
ALTER TABLE chart_of_accounts
  -- Remove type column and its constraint
  DROP CONSTRAINT IF EXISTS chart_of_accounts_type_check,
  DROP COLUMN IF EXISTS type,
  
  -- Add new columns
  ADD COLUMN IF NOT EXISTS zakat_eligible boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_cashbook boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS currency_id uuid REFERENCES currencies(id),
  
  -- Add constraint to ensure currency_id is set when is_cashbook is true
  ADD CONSTRAINT ensure_currency_for_cashbook 
    CHECK (NOT is_cashbook OR (is_cashbook AND currency_id IS NOT NULL));

-- Create function to generate account code
CREATE OR REPLACE FUNCTION generate_account_code()
RETURNS text AS $$
DECLARE
  v_next_num integer;
BEGIN
  -- Get the next number
  SELECT COALESCE(MAX(CAST(code AS integer)), 0) + 1
  INTO v_next_num
  FROM chart_of_accounts;
  
  -- Return formatted 10-digit code
  RETURN LPAD(v_next_num::text, 10, '0');
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate account code
CREATE OR REPLACE FUNCTION set_account_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := generate_account_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER before_insert_set_account_code
  BEFORE INSERT ON chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION set_account_code();