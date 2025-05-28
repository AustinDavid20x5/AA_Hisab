/*
  # Fix gl_headers foreign key constraint

  1. Changes
    - Drop incorrect foreign key constraint that references wrong column
    - Add correct foreign key constraint referencing tbl_trans_type.type_id
    - Remove redundant ID column from gl_headers table
  
  2. Details
    - The current foreign key constraint 'gl_headers_transaction_type_id uuid_fkey' is incorrectly 
      referencing the wrong column
    - We'll replace it with a correct constraint referencing tbl_trans_type.type_id
    - The redundant ID column is removed as it's not needed (we already have id as primary key)
*/

-- First drop the incorrect foreign key constraint
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'gl_headers_transaction_type_id uuid_fkey'
    AND table_name = 'gl_headers'
  ) THEN
    ALTER TABLE gl_headers DROP CONSTRAINT "gl_headers_transaction_type_id uuid_fkey";
  END IF;
END $$;

-- Drop the redundant ID column if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'gl_headers' 
    AND column_name = 'ID'
  ) THEN
    ALTER TABLE gl_headers DROP COLUMN "ID";
  END IF;
END $$;

-- Add the correct foreign key constraint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'gl_headers_type_id_fkey'
    AND table_name = 'gl_headers'
  ) THEN
    ALTER TABLE gl_headers 
    ADD CONSTRAINT gl_headers_type_id_fkey 
    FOREIGN KEY (type_id) 
    REFERENCES tbl_trans_type(type_id) 
    ON UPDATE CASCADE 
    ON DELETE RESTRICT;
  END IF;
END $$;