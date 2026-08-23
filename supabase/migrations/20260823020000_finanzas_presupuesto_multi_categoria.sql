-- Finanzas · Presupuesto: una línea puede cubrir varias categorías.
--
-- Hasta ahora `fin_budget_lines.category_id` era una sola columna (una
-- categoría, una línea). Pasa a una tabla puente — mismo mecanismo que
-- `fin_recurring_splits` para fijos y personas — con la restricción que le
-- da sentido al total general: una categoría no puede estar en dos
-- presupuestos activos a la vez, o el general contaría ese gasto dos veces.

create table if not exists fin_budget_line_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  line_id     uuid not null references fin_budget_lines(id) on delete cascade,
  category_id uuid not null references fin_categories(id) on delete cascade,
  created_at  timestamptz not null default now(),

  unique (line_id, category_id)
);

create index if not exists fin_budget_line_categories_line_idx on fin_budget_line_categories (line_id);

-- La restricción real: nunca dos líneas activas con la misma categoría. Como
-- una línea que se archiva se borra de verdad (DELETE, no un toggle — ver
-- `DELETE /api/finanzas/budgets/[id]`, que además se lleva en cascada
-- períodos/ampliaciones/cierres), no hace falta un índice parcial: basta con
-- que la fila de acá desaparezca cuando la línea desaparece.
create unique index if not exists fin_budget_line_categories_category_idx
  on fin_budget_line_categories (user_id, category_id);

alter table fin_budget_line_categories enable row level security;

drop policy if exists "fin: ver propias budget_line_categories"        on fin_budget_line_categories;
drop policy if exists "fin: crear propias budget_line_categories"      on fin_budget_line_categories;
drop policy if exists "fin: actualizar propias budget_line_categories" on fin_budget_line_categories;
drop policy if exists "fin: borrar propias budget_line_categories"     on fin_budget_line_categories;

create policy "fin: ver propias budget_line_categories" on fin_budget_line_categories for select
  using (auth.uid() = user_id);
create policy "fin: crear propias budget_line_categories" on fin_budget_line_categories for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propias budget_line_categories" on fin_budget_line_categories for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propias budget_line_categories" on fin_budget_line_categories for delete
  using (auth.uid() = user_id);

-- Backfill: cada línea existente tenía exactamente una categoría en su
-- propia columna — se copia tal cual antes de que la columna desaparezca.
insert into fin_budget_line_categories (user_id, line_id, category_id)
select user_id, id, category_id from fin_budget_lines
on conflict do nothing;

-- `category_id` de `fin_budget_lines` queda obsoleta: la fuente de verdad
-- pasa a ser la tabla puente. CASCADE se lleva el índice único y la FK que
-- colgaban de esta columna.
alter table fin_budget_lines drop column if exists category_id cascade;
