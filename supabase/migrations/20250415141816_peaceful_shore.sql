/*
  # Add Alias Name to Chart of Accounts

  1. Changes
    - Add alias_name column to chart_of_accounts table
*/

-- Add alias_name column
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS alias_name text;