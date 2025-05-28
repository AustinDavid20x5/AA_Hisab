/*
  # Initial Schema Setup for Accounting Application

  1. Base Tables
    - currencies
    - chart_of_accounts
    - categories
    - subcategories
    - transaction_types
    - roles
    - profiles

  2. Transaction Tables
    - gl_headers
    - gl_transactions

  3. Security
    - RLS policies for all tables
    - Role-based access control
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Roles table
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  permissions jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  full_name text,
  role_id uuid REFERENCES roles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Currencies table
CREATE TABLE currencies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code char(3) NOT NULL UNIQUE,
  name text NOT NULL,
  symbol text NOT NULL,
  rate decimal(10,4) NOT NULL DEFAULT 1.0000,
  is_base boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Categories table
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code varchar(10) NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Subcategories table
CREATE TABLE subcategories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id uuid REFERENCES categories(id),
  code varchar(10) NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Chart of Accounts table
CREATE TABLE chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code varchar(10) NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  subcategory_id uuid REFERENCES subcategories(id),
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Transaction Types table
CREATE TABLE transaction_types (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code varchar(10) NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  affects_inventory boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- GL Headers table
CREATE TABLE gl_headers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_no varchar(10) NOT NULL UNIQUE,
  transaction_date date NOT NULL,
  transaction_type_id uuid REFERENCES transaction_types(id),
  currency_id uuid REFERENCES currencies(id),
  exchange_rate decimal(10,4) NOT NULL DEFAULT 1.0000,
  description text,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'void')),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- GL Transactions table
CREATE TABLE gl_transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  header_id uuid REFERENCES gl_headers(id),
  account_id uuid REFERENCES chart_of_accounts(id),
  debit decimal(15,2) DEFAULT 0,
  credit decimal(15,2) DEFAULT 0,
  description text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Profiles are viewable by users" ON profiles
  FOR SELECT USING (auth.uid() IN (
    SELECT id FROM auth.users WHERE auth.uid() = id
  ));

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Policies for reference data (currencies, categories, etc.)
CREATE POLICY "Reference data viewable by authenticated users" ON currencies FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Reference data viewable by authenticated users" ON categories FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Reference data viewable by authenticated users" ON subcategories FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Reference data viewable by authenticated users" ON chart_of_accounts FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Reference data viewable by authenticated users" ON transaction_types FOR SELECT
  TO authenticated USING (true);

-- Policies for transactions
CREATE POLICY "Users can view their transactions" ON gl_headers FOR SELECT
  TO authenticated USING (created_by = auth.uid());

CREATE POLICY "Users can view their transaction details" ON gl_transactions FOR SELECT
  TO authenticated USING (
    header_id IN (
      SELECT id FROM gl_headers WHERE created_by = auth.uid()
    )
  );

-- Insert default data
INSERT INTO roles (name, permissions) VALUES
  ('admin', '{"all": true}'::jsonb),
  ('accountant', '{"transactions": true, "reports": true}'::jsonb),
  ('viewer', '{"reports": {"view": true}}'::jsonb);

-- Insert base currency
INSERT INTO currencies (code, name, symbol, is_base)
VALUES ('AED', 'UAE Dirham', 'د.إ', true);

-- Create function for auto-generating account codes
CREATE OR REPLACE FUNCTION generate_account_code(
  p_type text,
  p_category_id uuid
) RETURNS text AS $$
DECLARE
  v_prefix text;
  v_next_num int;
BEGIN
  -- Define prefix based on account type
  CASE p_type
    WHEN 'asset' THEN v_prefix := '1';
    WHEN 'liability' THEN v_prefix := '2';
    WHEN 'equity' THEN v_prefix := '3';
    WHEN 'revenue' THEN v_prefix := '4';
    WHEN 'expense' THEN v_prefix := '5';
  END CASE;

  -- Get next number
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 2) AS integer)), 0) + 1
  INTO v_next_num
  FROM chart_of_accounts
  WHERE code LIKE v_prefix || '%';

  -- Return formatted code
  RETURN v_prefix || LPAD(v_next_num::text, 9, '0');
END;
$$ LANGUAGE plpgsql;

-- Create function for auto-generating voucher numbers
CREATE OR REPLACE FUNCTION generate_voucher_number(
  p_transaction_type_id uuid
) RETURNS text AS $$
DECLARE
  v_prefix text;
  v_next_num int;
BEGIN
  -- Get prefix from transaction type
  SELECT UPPER(SUBSTRING(code FROM 1 FOR 2))
  INTO v_prefix
  FROM transaction_types
  WHERE id = p_transaction_type_id;

  -- Get next number
  SELECT COALESCE(MAX(CAST(SUBSTRING(voucher_no FROM 3) AS integer)), 0) + 1
  INTO v_next_num
  FROM gl_headers
  WHERE voucher_no LIKE v_prefix || '%';

  -- Return formatted voucher number
  RETURN v_prefix || LPAD(v_next_num::text, 8, '0');
END;
$$ LANGUAGE plpgsql;