-- Finanzas · Sprint 7: dos agujeros del constraint de `savings_flow`.
--
-- BUG 1 — la lógica de tres valores lo dejaba pasar todo.
--   El constraint de `20260826020000` decía:
--     (goal is null and flow is null) or (goal is not null and flow in (...))
--   Con `goal` puesto y `flow` NULL, la segunda rama evalúa
--   `true AND NULL` = NULL, la primera evalúa false, y `false OR NULL` = NULL.
--   Un CHECK que da NULL **no se viola**: la fila entraba igual. Comprobado
--   por REST — insert con `savings_goal_id` y sin `savings_flow` → 201, fila
--   guardada con la dirección en null, que es exactamente el dato ilegible
--   que la revisión 4 vino a eliminar.
--
-- BUG 2 — borrar un ahorro con movimientos era imposible.
--   `fin_transactions.savings_goal_id` es `on delete set null`, pero
--   `savings_flow` se quedaba con su valor. La fila resultante
--   (goal null, flow 'retiro') sí viola las dos ramas, así que el DELETE
--   moría con el mensaje crudo de Postgres:
--     new row for relation "fin_transactions" violates check constraint
--     "fin_tx_savings_flow_shape"
--   Efecto para el usuario: cualquier ahorro que alguna vez recibió un aporte
--   quedaba imborrable, con un error ilegible. Se arregla con un trigger que
--   limpia la dirección y el motivo ANTES de que la FK suelte la etiqueta —
--   es lo coherente: sin ahorro al que pertenecer, el movimiento deja de ser
--   un movimiento de ahorro, y su dirección y su motivo no significan nada.

-- Residuos de la ventana en que el constraint no atajaba nada.
update fin_transactions
   set savings_flow = case when savings_reason is not null then 'retiro' else 'aporte' end
 where savings_goal_id is not null and savings_flow is null;

update fin_transactions
   set savings_flow = null, savings_reason = null
 where savings_goal_id is null and (savings_flow is not null or savings_reason is not null);

create or replace function fin_clear_savings_tag()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update fin_transactions
     set savings_flow = null, savings_reason = null
   where savings_goal_id = old.id;
  return old;
end;
$$;

drop trigger if exists fin_savings_goals_clear_tag on fin_savings_goals;
create trigger fin_savings_goals_clear_tag
  before delete on fin_savings_goals
  for each row execute function fin_clear_savings_tag();

-- `flow is not null` explícito: sin él la rama entera evalúa a NULL y el
-- CHECK deja pasar la fila (BUG 1).
alter table fin_transactions
  drop constraint if exists fin_tx_savings_flow_shape;
alter table fin_transactions
  add constraint fin_tx_savings_flow_shape check (
    (savings_goal_id is null and savings_flow is null)
    or (savings_goal_id is not null
        and savings_flow is not null
        and savings_flow in ('aporte', 'retiro'))
  );
