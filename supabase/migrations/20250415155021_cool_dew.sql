/*
  # Fix Business Partner Subcategory

  1. Changes
    - Ensure Business Partner subcategory exists
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
      VALUES ('BS', 'Business Partners', 'All business partner accounts')
      ON CONFLICT (code) DO UPDATE 
      SET name = EXCLUDED.name,
          description = EXCLUDED.description
      RETURNING id
    )
    SELECT COALESCE(
      (SELECT id FROM categories WHERE code = 'BS'),
      (SELECT id FROM category_insert)
    ) INTO v_category_id;

    -- Create Business Partner subcategory
    INSERT INTO subcategories (
      category_id,
      code,
      name,
      description
    )
    VALUES (
      v_category_id,
      'BS',
      'Business Partner',
      'Business partner accounts for transactions'
    )
    ON CONFLICT (code) DO UPDATE 
    SET name = EXCLUDED.name,
        description = EXCLUDED.description;
  END IF;
END $$;