-- Finanzas · Sprint 3: "Fijos"
--
-- Spec: documentos/finanzas/sprint_3_fijos.md
--
-- Una plantilla es "un gasto que todavía no pasó". La relación
-- fin_recurring → fin_recurring_splits es la MISMA forma que
-- fin_transactions → fin_splits, un nivel más arriba: registrar una plantilla
-- es instanciarla. No hay concepto nuevo, ni para el usuario ni para el código.
--
-- "Compartido" y "recurrente" son atributos independientes: cualquier
-- combinación existe (el alquiler es fijo y solo tuyo; Spotify es fijo y
-- compartido). Por eso el reparto es opcional dentro de la plantilla, y no un
-- tipo de plantilla aparte.

create table if not exists fin_recurring (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  name          text not null,
  emoji         text,

  -- El monto es un DEFAULT, no una ley: se puede editar al confirmar. Spotify
  -- sube de precio y no por eso la plantilla queda inservible.
  amount        numeric(24,8) not null check (amount > 0),

  -- La moneda sale de la cuenta, igual que en fin_transactions. Restrict
  -- porque borrar la cuenta dejaría la plantilla sin poder instanciarse.
  account_id    uuid not null references fin_accounts(id) on delete restrict,
  category_id   uuid references fin_categories(id) on delete set null,

  frequency     text not null default 'mensual' check (frequency in ('mensual','anual')),
  -- El día en que cae. Se topea contra el largo del mes al calcularlo: un
  -- `31` en febrero es el 28.
  day_of_month  integer not null default 1 check (day_of_month between 1 and 31),
  -- Solo para las anuales. Null en las mensuales.
  month_of_year integer check (month_of_year between 1 and 12),

  active        boolean not null default true,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint fin_recurring_anual_shape check (
    (frequency = 'anual' and month_of_year is not null)
    or (frequency = 'mensual' and month_of_year is null)
  )
);

create index if not exists fin_recurring_user_idx on fin_recurring (user_id, active, day_of_month);

-- ─── El reparto por defecto ─────────────────────────────────────────────────
--
-- `amount` NULL significa "parte pareja": se calcula al registrar, con el monto
-- de ese mes. Si Spotify sube de $11.99 a $12.99, el reparto se reajusta solo.
-- Con el monto congelado en la plantilla, les cobrarías de menos sin enterarte.

create table if not exists fin_recurring_splits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  -- cascade, y acá SÍ corresponde: a diferencia de fin_splits —donde una fila
  -- es una deuda real— esto es configuración. Borrar la plantilla se lleva su
  -- reparto por defecto, pero NO toca ninguna deuda ya generada.
  recurring_id  uuid not null references fin_recurring(id) on delete cascade,

  -- restrict, igual que en fin_splits: una persona con historial no se borra.
  person_id     uuid not null references fin_people(id) on delete restrict,

  amount        numeric(24,8) check (amount is null or amount > 0),
  created_at    timestamptz not null default now(),

  unique (recurring_id, person_id)
);

create index if not exists fin_recurring_splits_rec_idx on fin_recurring_splits (recurring_id);

-- ─── El vínculo de vuelta ───────────────────────────────────────────────────
--
-- "¿Ya lo registré este mes?" NO se guarda: se deriva de que exista una
-- transacción con este recurring_id dentro del período. Mismo principio que los
-- estados de las deudas del Sprint 2 — un flag guardado se desincroniza del
-- hecho que describe, un puntero no.
--
-- set null: borrar la plantilla no borra la historia de lo que pagaste. Los
-- movimientos quedan, solo pierden el vínculo.
alter table fin_transactions
  add column if not exists recurring_id uuid references fin_recurring(id) on delete set null;

create index if not exists fin_transactions_recurring_idx
  on fin_transactions (user_id, recurring_id, date);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table fin_recurring        enable row level security;
alter table fin_recurring_splits enable row level security;

drop policy if exists "fin: ver propios fijos"        on fin_recurring;
drop policy if exists "fin: crear propios fijos"      on fin_recurring;
drop policy if exists "fin: actualizar propios fijos" on fin_recurring;
drop policy if exists "fin: borrar propios fijos"     on fin_recurring;

create policy "fin: ver propios fijos" on fin_recurring for select
  using (auth.uid() = user_id);
create policy "fin: crear propios fijos" on fin_recurring for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propios fijos" on fin_recurring for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propios fijos" on fin_recurring for delete
  using (auth.uid() = user_id);

drop policy if exists "fin: ver propios repartos fijos"        on fin_recurring_splits;
drop policy if exists "fin: crear propios repartos fijos"      on fin_recurring_splits;
drop policy if exists "fin: actualizar propios repartos fijos" on fin_recurring_splits;
drop policy if exists "fin: borrar propios repartos fijos"     on fin_recurring_splits;

create policy "fin: ver propios repartos fijos" on fin_recurring_splits for select
  using (auth.uid() = user_id);
create policy "fin: crear propios repartos fijos" on fin_recurring_splits for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propios repartos fijos" on fin_recurring_splits for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propios repartos fijos" on fin_recurring_splits for delete
  using (auth.uid() = user_id);
