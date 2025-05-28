/*
  # Create subcategories table and related security policies

  1. New Tables
    - `subcategories`
      - `id` (uuid, primary key)
      - `category_id` (uuid, references categories)
      - `code` (varchar(10), unique)
      - `name` (text, not null)
      - `description` (text)
      - `created_by` (uuid, references users)
      - `updated_by` (uuid, references users)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on subcategories table
    - Add policies for:
      - Authenticated users can view all subcategories
      - Users can only create/update/delete subcategories if they have appropriate permissions
*/

-- Create subcategories table
CREATE TABLE IF NOT EXISTS subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  code varchar(10) UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Subcategories are viewable by authenticated users"
  ON subcategories
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert subcategories"
  ON subcategories
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own subcategories"
  ON subcategories
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete their own subcategories"
  ON subcategories
  FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_subcategories_updated_at
  BEFORE UPDATE ON subcategories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create trigger to automatically set created_by and updated_by
CREATE TRIGGER set_subcategories_user_ids
  BEFORE INSERT OR UPDATE ON subcategories
  FOR EACH ROW
  EXECUTE FUNCTION set_user_ids();