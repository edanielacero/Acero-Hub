-- Remove duplicate variable definitions (keep the first by sort_order/id)
DELETE FROM public.tj_variable_definitions
WHERE id NOT IN (
  SELECT DISTINCT ON (session_id, key) id
  FROM public.tj_variable_definitions
  ORDER BY session_id, key, sort_order ASC NULLS LAST, id ASC
);

-- Prevent future duplicates
ALTER TABLE public.tj_variable_definitions
  ADD CONSTRAINT tj_variable_definitions_session_key_unique UNIQUE (session_id, key);
