-- Unify "Horario" variable: rename key 'hora' → 'horario' in source session 2
-- so both source sessions of "Estrategia Combinada" share the same key.

DO $$
DECLARE
  v_session_id uuid := '7ba3bd14-3e88-44e3-811d-d6932a10c16f';
BEGIN
  -- 1. Rename the variable definition key
  UPDATE public.tj_variable_definitions
  SET key = 'horario'
  WHERE session_id = v_session_id AND key = 'hora';

  -- 2. Rename the key inside every trade's custom_fields JSONB
  UPDATE public.tj_trades
  SET custom_fields = (custom_fields - 'hora') || jsonb_build_object('horario', custom_fields -> 'hora')
  WHERE session_id = v_session_id
    AND custom_fields ? 'hora';
END $$;
