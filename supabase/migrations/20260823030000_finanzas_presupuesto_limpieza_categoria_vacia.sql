-- Finanzas · Presupuesto: una línea sin ninguna categoría no tiene sentido.
--
-- `fin_budget_lines` ya no referencia `fin_categories` directamente (la
-- fuente de verdad es `fin_budget_line_categories`), así que borrar una
-- categoría que era la única de una línea ya no se lleva la línea sola por
-- cascada — ahora solo se lleva SU fila puntual en la tabla puente. Sin este
-- trigger, la línea quedaba "viva" pero vacía: un presupuesto de ninguna
-- categoría, mostrando nombre y montos en blanco.
--
-- Corre después de CUALQUIER borrado en la tabla puente —directo, o como
-- cascada de borrar la categoría o la línea misma— así que funciona
-- igual sin importar por dónde se borre.

create or replace function fin_budget_lines_delete_if_empty() returns trigger as $$
begin
  delete from fin_budget_lines
  where id = old.line_id
    and not exists (
      select 1 from fin_budget_line_categories where line_id = old.line_id
    );
  return old;
end;
$$ language plpgsql;

drop trigger if exists fin_budget_line_categories_cleanup on fin_budget_line_categories;
create trigger fin_budget_line_categories_cleanup
  after delete on fin_budget_line_categories
  for each row
  execute function fin_budget_lines_delete_if_empty();
