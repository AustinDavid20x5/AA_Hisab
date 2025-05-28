/*
  # Remove overloaded trial balance function

  1. Changes
    - Drop the overloaded trial balance function with p_date parameter
    - Keep only the parameterless get_trial_balance() function

  Note: This ensures there's no ambiguity when calling get_trial_balance from the frontend
*/

DROP FUNCTION IF EXISTS public.get_trial_balance(p_date date);