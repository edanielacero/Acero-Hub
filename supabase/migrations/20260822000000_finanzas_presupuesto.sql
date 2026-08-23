-- Finanzas · Sprint 6: "Presupuesto"
--
-- Spec: documentos/finanzas/sprint_6_presupuesto.md (revisión 3)
--
-- Cuatro tablas nuevas, nada de lo que existe cambia de forma:
--   fin_budget_lines      — la plantilla (una por categoría, o una general con
--                           category_id null)
--   fin_budget_periods    — el monto de cada mes, perezoso: solo se guardan
--                           los meses que alguien tocó
--   fin_budget_extensions — el rastro de cada ampliación al bloquear el
--                           quick-add, nunca pisa el monto original
--   fin_budget_closures   — la decisión de cierre de cada mes (¿se lleva el
--                           sobrante/sobregasto al siguiente, o no?),
--                           reemplaza a un `rollover_mode` estático: la
--                           ausencia de fila ES la pregunta pendiente

create table if not exists fin_budget_lines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  -- null = el tope general. Mismo mecanismo que fin_debts.transaction_id
  -- nullable: una fila con el campo vacío en vez de una tabla aparte.
  category_id  uuid references fin_categories(id) on delete cascade,

  -- Se pregunta una sola vez, al crear la línea, y no hay endpoint que lo
  -- cambie después: si el primer período (el de creación) cuenta desde el
  -- día 1 del mes (true) o solo desde created_on en adelante (false).
  retroactive  boolean not null default true,
  created_on   date not null default current_date,

  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Una línea activa por categoría.
create unique index if not exists fin_budget_lines_category_idx
  on fin_budget_lines (user_id, category_id)
  where category_id is not null and not archived;

-- Como máximo una línea "tope general" (category_id null) activa.
create unique index if not exists fin_budget_lines_general_idx
  on fin_budget_lines (user_id)
  where category_id is null and not archived;

create table if not exists fin_budget_periods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  line_id    uuid not null references fin_budget_lines(id) on delete cascade,
  period     date not null,          -- primer día del mes, ej. 2026-08-01
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (line_id, period)
);

create index if not exists fin_budget_periods_user_idx on fin_budget_periods (user_id, period);

create table if not exists fin_budget_extensions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  period_id  uuid not null references fin_budget_periods(id) on delete cascade,
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  created_at timestamptz not null default now()
);

create index if not exists fin_budget_extensions_period_idx on fin_budget_extensions (period_id);

create table if not exists fin_budget_closures (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  line_id    uuid not null references fin_budget_lines(id) on delete cascade,
  period     date not null,           -- el período que se cierra
  carried    boolean not null,        -- true = se lleva al período siguiente
  -- El disponible congelado al momento de decidir. Puede ser negativo — un mes
  -- en rojo es tan "cerrable" como uno en verde, y CHECK > 0 lo rechazaría.
  amount_usd numeric(14,2) not null,
  decided_at timestamptz not null default now(),

  unique (line_id, period)
);

create index if not exists fin_budget_closures_user_idx on fin_budget_closures (user_id, period);

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Las 4 tablas: sin excepciones, sin createAdminClient() en las rutas de datos.

alter table fin_budget_lines enable row level security;
alter table fin_budget_periods enable row level security;
alter table fin_budget_extensions enable row level security;
alter table fin_budget_closures enable row level security;

drop policy if exists "fin: ver propias budget_lines"        on fin_budget_lines;
drop policy if exists "fin: crear propias budget_lines"      on fin_budget_lines;
drop policy if exists "fin: actualizar propias budget_lines" on fin_budget_lines;
drop policy if exists "fin: borrar propias budget_lines"     on fin_budget_lines;

create policy "fin: ver propias budget_lines" on fin_budget_lines for select
  using (auth.uid() = user_id);
create policy "fin: crear propias budget_lines" on fin_budget_lines for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propias budget_lines" on fin_budget_lines for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propias budget_lines" on fin_budget_lines for delete
  using (auth.uid() = user_id);

drop policy if exists "fin: ver propios budget_periods"        on fin_budget_periods;
drop policy if exists "fin: crear propios budget_periods"      on fin_budget_periods;
drop policy if exists "fin: actualizar propios budget_periods" on fin_budget_periods;
drop policy if exists "fin: borrar propios budget_periods"     on fin_budget_periods;

create policy "fin: ver propios budget_periods" on fin_budget_periods for select
  using (auth.uid() = user_id);
create policy "fin: crear propios budget_periods" on fin_budget_periods for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propios budget_periods" on fin_budget_periods for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propios budget_periods" on fin_budget_periods for delete
  using (auth.uid() = user_id);

drop policy if exists "fin: ver propias budget_extensions"        on fin_budget_extensions;
drop policy if exists "fin: crear propias budget_extensions"      on fin_budget_extensions;
drop policy if exists "fin: actualizar propias budget_extensions" on fin_budget_extensions;
drop policy if exists "fin: borrar propias budget_extensions"     on fin_budget_extensions;

create policy "fin: ver propias budget_extensions" on fin_budget_extensions for select
  using (auth.uid() = user_id);
create policy "fin: crear propias budget_extensions" on fin_budget_extensions for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propias budget_extensions" on fin_budget_extensions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propias budget_extensions" on fin_budget_extensions for delete
  using (auth.uid() = user_id);

drop policy if exists "fin: ver propios budget_closures"        on fin_budget_closures;
drop policy if exists "fin: crear propios budget_closures"      on fin_budget_closures;
drop policy if exists "fin: actualizar propios budget_closures" on fin_budget_closures;
drop policy if exists "fin: borrar propios budget_closures"     on fin_budget_closures;

create policy "fin: ver propios budget_closures" on fin_budget_closures for select
  using (auth.uid() = user_id);
create policy "fin: crear propios budget_closures" on fin_budget_closures for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propios budget_closures" on fin_budget_closures for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propios budget_closures" on fin_budget_closures for delete
  using (auth.uid() = user_id);
