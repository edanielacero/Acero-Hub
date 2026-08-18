-- Finanzas · Sprint 2: "Compartidos y reembolsos"
--
-- Spec completa: documentos/finanzas/sprint_2_compartidos.md
--
-- Dos tablas satélite y una columna. Nada de lo que ya existe cambia de forma:
-- fin_transactions solo recibe `flow_type`, con default, tal como el Sprint 1
-- había prometido en su §9.

-- ─── flow_type: la columna que mantiene honesto el "gasto real" ─────────────
--
-- No toda plata que entra es un ingreso, y no toda plata que sale es un gasto.
-- Un reembolso de Spotify sube el saldo (es plata real) pero NO es un ingreso:
-- sin esta distinción, recuperar $8.99 se vería como haber ganado $8.99 y el
-- reporte anual inventaría una fuente de ingresos que no existe.

alter table fin_transactions
  add column if not exists flow_type text not null default 'consumo';

alter table fin_transactions drop constraint if exists fin_transactions_flow_type_check;
alter table fin_transactions add constraint fin_transactions_flow_type_check
  check (flow_type in ('consumo','movimiento'));

-- Backfill: las transferencias ya eran movimientos financieros, solo que la
-- app lo deducía del `type`. Ahora queda dicho en la fila.
update fin_transactions set flow_type = 'movimiento'
  where type = 'transferencia' and flow_type <> 'movimiento';

-- `category_id is null` cuando es movimiento: un reembolso con categoría
-- "Otros ingresos" contaminaría cualquier reporte futuro por categoría. La base
-- lo impide en vez de confiar en que nadie lo haga.
alter table fin_transactions drop constraint if exists fin_tx_flow_shape;
alter table fin_transactions add constraint fin_tx_flow_shape check (
  (type = 'transferencia' and flow_type = 'movimiento')
  or (type = 'ingreso' and flow_type = 'movimiento' and category_id is null)
  or (type in ('gasto','ingreso') and flow_type = 'consumo')
);

-- ─── fin_people ─────────────────────────────────────────────────────────────
--
-- Personas, no usuarios. No hay auth.users detrás de ellas y nunca lo habrá:
-- es una app de un solo usuario. "Ana" es una etiqueta, no una cuenta.

create table if not exists fin_people (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  emoji       text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Sobre lower(name) para que "ana" y "Ana" no coexistan — el error más probable
-- al crear personas escribiendo el nombre. Parcial, para poder reusar un nombre
-- después de archivarlo.
create unique index if not exists fin_people_user_name_idx
  on fin_people (user_id, lower(name)) where not archived;

-- ─── fin_splits ─────────────────────────────────────────────────────────────
--
-- Una fila por persona por gasto compartido. El estado de la deuda NO se
-- guarda: se deriva de dos punteros, así que es imposible que diga "cobrada"
-- sin que exista el movimiento que la cobró.
--
--   pendiente → settled_tx_id is null and waived_at is null
--   cobrada   → settled_tx_id apunta al ingreso · movimiento
--   condonada → waived_at con fecha

create table if not exists fin_splits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- restrict: un split sin gasto padre no significa nada, y un split cobrado
  -- cuyo gasto desaparece deja un ingreso sin nada que lo explique.
  transaction_id  uuid not null references fin_transactions(id) on delete restrict,

  -- restrict: una persona con historial no se borra, se archiva.
  person_id       uuid not null references fin_people(id) on delete restrict,

  amount          numeric(24,8) not null check (amount > 0),
  currency        text not null check (currency in ('USD','BOB','USDT','USDC','BTC')),
  amount_usd      numeric(14,2) not null,

  -- set null: si borrás el cobro, la deuda vuelve a pendiente. El estado de
  -- reposo es correcto y significa algo, a diferencia del caso de arriba.
  -- No es único a propósito: un solo cobro puede saldar varias deudas.
  settled_tx_id   uuid references fin_transactions(id) on delete set null,

  waived_at       date,
  note            text,
  created_at      timestamptz not null default now(),

  unique (transaction_id, person_id),

  constraint fin_split_settle_shape check (settled_tx_id is null or waived_at is null)
);

create index if not exists fin_splits_user_open_idx
  on fin_splits (user_id) where settled_tx_id is null and waived_at is null;
create index if not exists fin_splits_tx_idx      on fin_splits (transaction_id);
create index if not exists fin_splits_person_idx  on fin_splits (person_id);
create index if not exists fin_splits_settled_idx on fin_splits (settled_tx_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Las 4 policies por tabla, todas con user_id = auth.uid(). Sin excepciones.

alter table fin_people enable row level security;
alter table fin_splits enable row level security;

drop policy if exists "fin: ver propias personas"        on fin_people;
drop policy if exists "fin: crear propias personas"      on fin_people;
drop policy if exists "fin: actualizar propias personas" on fin_people;
drop policy if exists "fin: borrar propias personas"     on fin_people;

create policy "fin: ver propias personas" on fin_people for select
  using (auth.uid() = user_id);
create policy "fin: crear propias personas" on fin_people for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propias personas" on fin_people for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propias personas" on fin_people for delete
  using (auth.uid() = user_id);

drop policy if exists "fin: ver propios repartos"        on fin_splits;
drop policy if exists "fin: crear propios repartos"      on fin_splits;
drop policy if exists "fin: actualizar propios repartos" on fin_splits;
drop policy if exists "fin: borrar propios repartos"     on fin_splits;

create policy "fin: ver propios repartos" on fin_splits for select
  using (auth.uid() = user_id);
create policy "fin: crear propios repartos" on fin_splits for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propios repartos" on fin_splits for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propios repartos" on fin_splits for delete
  using (auth.uid() = user_id);

-- ─── Limpieza: fin_settings quedó huérfana ──────────────────────────────────
-- La creó 20260818000000 y la reemplazó fin_rates en 20260818010000. Ningún
-- archivo del código la lee desde entonces.
drop table if exists fin_settings;
