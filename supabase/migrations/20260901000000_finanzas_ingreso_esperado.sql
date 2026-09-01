-- Finanzas · Sprint 10: "Ingreso esperado y margen del mes"
--
-- REVERTIDA por 20260901010000 — la feature no se usó. Este archivo queda
-- solo para que el historial de migraciones remoto tenga su par local; no
-- crear nada nuevo sobre estas tablas.
--
-- Dos tablas, mismo par que Presupuesto:
--   fin_income_sources — la fuente de ingreso: nombre y moneda
--   fin_income_periods — cuánto se espera de esa fuente en ESE mes

create table if not exists fin_income_sources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  profile_id  uuid not null references fin_profiles(id) on delete restrict,

  name        text not null,
  currency    text not null default 'USD'
                check (currency in ('USD','BOB','USDT','USDC','BTC')),

  archived    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create unique index if not exists fin_income_sources_name_idx
  on fin_income_sources (profile_id, lower(name));

create index if not exists fin_income_sources_profile_idx
  on fin_income_sources (profile_id, archived, sort_order);

create table if not exists fin_income_periods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  profile_id  uuid not null references fin_profiles(id) on delete restrict,
  source_id   uuid not null references fin_income_sources(id) on delete cascade,

  period      date not null,

  amount      numeric(24,8) not null check (amount > 0),
  amount_usd  numeric(14,2) not null check (amount_usd > 0),
  exchange_rate numeric(24,8) not null check (exchange_rate > 0),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (source_id, period)
);

alter table fin_income_periods
  drop constraint if exists fin_income_periods_period_day1;
alter table fin_income_periods
  add constraint fin_income_periods_period_day1
  check (extract(day from period) = 1);

create index if not exists fin_income_periods_profile_idx
  on fin_income_periods (profile_id, period);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table fin_income_sources enable row level security;
alter table fin_income_periods enable row level security;

drop policy if exists "fin: ver propias income_sources"        on fin_income_sources;
drop policy if exists "fin: crear propias income_sources"      on fin_income_sources;
drop policy if exists "fin: actualizar propias income_sources" on fin_income_sources;
drop policy if exists "fin: borrar propias income_sources"     on fin_income_sources;

create policy "fin: ver propias income_sources" on fin_income_sources for select
  using (auth.uid() = user_id);
create policy "fin: crear propias income_sources" on fin_income_sources for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propias income_sources" on fin_income_sources for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propias income_sources" on fin_income_sources for delete
  using (auth.uid() = user_id);

drop policy if exists "fin: ver propios income_periods"        on fin_income_periods;
drop policy if exists "fin: crear propios income_periods"      on fin_income_periods;
drop policy if exists "fin: actualizar propios income_periods" on fin_income_periods;
drop policy if exists "fin: borrar propios income_periods"     on fin_income_periods;

create policy "fin: ver propios income_periods" on fin_income_periods for select
  using (auth.uid() = user_id);
create policy "fin: crear propios income_periods" on fin_income_periods for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propios income_periods" on fin_income_periods for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propios income_periods" on fin_income_periods for delete
  using (auth.uid() = user_id);

-- fin_profile_has_data sumaba estas dos tablas acá; 20260901010000 la devuelve
-- a su definición sin ellas.
