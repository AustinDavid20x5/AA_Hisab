/*
  # Add Business Partner Subcategory

  1. Changes
    - Add Business Partner subcategory if it doesn't exist
    - Link it to appropriate category
*/

DO $$ 
DECLARE
  v_category_id uuid;
  v_subcategory_exists boolean;
BEGIN
  -- First check if Business Partner subcategory exists
  SELECT EXISTS (
    SELECT 1 FROM subcategories WHERE name = 'Business Partner'
  ) INTO v_subcategory_exists;

  IF NOT v_subcategory_exists THEN
    -- Get or create a category for business partners
    WITH category_insert AS (
      INSERT INTO categories (code, name, description)
      VALUES ('CAT001', 'Business Partners', 'All business partner accounts')
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    )
    SELECT id INTO v_category_id FROM category_insert;

    -- Create Business Partner subcategory
    INSERT INTO subcategories (
      category_id,
      code,
      name,
      description
    )
    VALUES (
      v_category_id,
      'SUB001',
      'Business Partner',
      'Business partner accounts for transactions'
    )
    ON CONFLICT (code) DO NOTHING;
  END IF;
END $$;