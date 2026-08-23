-- Finanzas · Presupuesto (rediseño): el "tope general" deja de ser una línea
-- propia y pasa a ser un agregado — la suma de las categorías presupuestadas,
-- nunca una entidad que se crea o edita por su cuenta.
--
-- `category_id` pasa a NOT NULL: todo presupuesto está atado a una categoría,
-- sin excepción. El índice parcial que reservaba un único "general" (category_id
-- null) ya no tiene sentido y se cae.

alter table fin_budget_lines alter column category_id set not null;

drop index if exists fin_budget_lines_general_idx;

-- El índice por categoría no necesita más el "category_id is not null": ya lo
-- garantiza la columna. Se recrea más simple, mismo comportamiento.
drop index if exists fin_budget_lines_category_idx;
create unique index fin_budget_lines_category_idx
  on fin_budget_lines (user_id, category_id)
  where not archived;
