-- Finanzas · Presupuesto: el trigger de limpieza tiene que correr como su
-- dueño, no como quien dispara el borrado.
--
-- `fin_budget_lines_delete_if_empty` se creó sin SECURITY DEFINER. Un
-- borrado en cascada por FK no chequea permisos (lo resuelve el motor), pero
-- el DELETE que hace ESTE trigger sí: corre con el rol de quien empezó la
-- operación. Al borrar un usuario, esa operación la ejecuta
-- `supabase_auth_admin`, que no tiene permisos sobre las tablas de public —
-- así que el trigger fallaba y el borrado entero se abortaba con
-- "Database error deleting user". En la práctica: ninguna cuenta que tuviera
-- un presupuesto se podía eliminar (y el barrido de usuarios de prueba del
-- suite dejaba huérfanos en la base real).
--
-- SECURITY DEFINER lo hace correr como `postgres` (su dueño). `search_path`
-- fijo y vacío es la contraparte obligatoria: sin eso, una función definer
-- puede resolver nombres contra un esquema que controle quien la llama, así
-- que las tablas van calificadas a mano.

create or replace function fin_budget_lines_delete_if_empty() returns trigger as $$
begin
  delete from public.fin_budget_lines
  where id = old.line_id
    and not exists (
      select 1 from public.fin_budget_line_categories where line_id = old.line_id
    );
  return old;
end;
$$ language plpgsql security definer set search_path = '';
