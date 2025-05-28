/*
  # Add Rate Columns to GL Transactions Table

  1. New Columns
    - purchase_rate: Stores the purchase rate per 100k for bank transfers
    - sales_rate: Stores the sales rate per 100k for bank transfers

  2. Changes
    - Add new nullable numeric columns to gl_transactions table
    - Add indexes for better query performance
*/

-- Add new columns to gl_transactions table
ALTER TABLE gl_transactions
  ADD COLUMN IF NOT EXISTS purchase_rate numeric(10,4),
  ADD COLUMN IF NOT EXISTS sales_rate numeric(10,4);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_gl_transactions_purchase_rate
  ON gl_transactions(purchase_rate);

CREATE INDEX IF NOT EXISTS idx_gl_transactions_sales_rate
  ON gl_transactions(sales_rate);