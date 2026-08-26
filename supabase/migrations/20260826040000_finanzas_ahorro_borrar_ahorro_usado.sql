-- Finanzas · Sprint 7: borrar un ahorro que ya tiene movimientos.
--
-- El trigger de `20260826030000` limpiaba `savings_flow` y `savings_reason`
-- pero dejaba la etiqueta puesta, contando con que la FK
-- (`on delete set null`) la soltara después. Un CHECK no es diferible: la
-- fila intermedia (goal puesto, flow null) viola el constraint en el acto y
-- el DELETE moría igual, con el mismo mensaje crudo.
--
-- La etiqueta y su dirección son un solo dato: se sueltan juntas, en un solo
-- UPDATE, antes de que la fila del ahorro desaparezca. La FK queda como red
-- de seguridad y no tiene nada que hacer.

create or replace function fin_clear_savings_tag()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update fin_transactions
     set savings_goal_id = null, savings_flow = null, savings_reason = null
   where savings_goal_id = old.id;
  return old;
end;
$$;
