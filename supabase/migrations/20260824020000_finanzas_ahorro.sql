-- Finanzas · Sprint 7: "Ahorro"
--
-- Spec: documentos/finanzas/sprint_7_ahorro.md
--
-- Una columna en fin_accounts, una columna+campo en fin_transactions, y dos
-- tablas nuevas:
--   fin_savings_goals    — los ahorros (antes "motivos"): nombre, moneda,
--                          reparto (fijo o %), meta opcional
--   fin_savings_closures — la decisión de cada mes (¿ya se repartió el
--                          sobrante?). Ausencia de fila = pregunta pendiente,
--                          mismo mecanismo que fin_budget_closures.

alter table fin_accounts
  add column if not exists is_savings boolean not null default false;

alter table fin_accounts
  drop constraint if exists fin_accounts_savings_investment_excl;
alter table fin_accounts
  add constraint fin_accounts_savings_investment_excl
  check (not (is_investment and is_savings));

create table if not exists fin_savings_goals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  input_currency    text not null check (input_currency in ('USD','BOB','USDT','USDC','BTC')),
  allocation_type   text not null check (allocation_type in ('fixed','percent')),
  allocation_value  numeric(24,8) not null check (allocation_value > 0),
  target_amount     numeric(24,8) check (target_amount is null or target_amount > 0),
  target_date       date,
  sort_order        integer not null default 0,
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint fin_savings_goal_percent_range
    check (allocation_type = 'fixed' or allocation_value <= 100)
);
create index if not exists fin_savings_goals_user_idx on fin_savings_goals (user_id, archived, sort_order);

alter table fin_transactions
  add column if not exists savings_goal_id uuid references fin_savings_goals(id) on delete set null;
alter table fin_transactions
  add column if not exists savings_reason text;
alter table fin_transactions
  drop constraint if exists fin_tx_savings_reason_shape;
alter table fin_transactions
  add constraint fin_tx_savings_reason_shape
  check (savings_reason is null or savings_reason in ('emergencia','meta_cumplida','cambio_planes','otro'));

create index if not exists fin_transactions_savings_goal_idx
  on fin_transactions (savings_goal_id) where savings_goal_id is not null;

create table if not exists fin_savings_closures (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  period       date not null,           -- primer día del mes que se cierra
  surplus_usd  numeric(14,2) not null,  -- congelado al decidir, puede ser negativo
  decided_at   timestamptz not null default now(),

  unique (user_id, period)
);
create index if not exists fin_savings_closures_user_idx on fin_savings_closures (user_id, period);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table fin_savings_goals enable row level security;
alter table fin_savings_closures enable row level security;

drop policy if exists "fin: ver propios savings_goals"        on fin_savings_goals;
drop policy if exists "fin: crear propios savings_goals"      on fin_savings_goals;
drop policy if exists "fin: actualizar propios savings_goals" on fin_savings_goals;
drop policy if exists "fin: borrar propios savings_goals"     on fin_savings_goals;

create policy "fin: ver propios savings_goals" on fin_savings_goals for select
  using (auth.uid() = user_id);
create policy "fin: crear propios savings_goals" on fin_savings_goals for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propios savings_goals" on fin_savings_goals for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propios savings_goals" on fin_savings_goals for delete
  using (auth.uid() = user_id);

drop policy if exists "fin: ver propios savings_closures"        on fin_savings_closures;
drop policy if exists "fin: crear propios savings_closures"      on fin_savings_closures;
drop policy if exists "fin: actualizar propios savings_closures" on fin_savings_closures;
drop policy if exists "fin: borrar propios savings_closures"     on fin_savings_closures;

create policy "fin: ver propios savings_closures" on fin_savings_closures for select
  using (auth.uid() = user_id);
create policy "fin: crear propios savings_closures" on fin_savings_closures for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propios savings_closures" on fin_savings_closures for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propios savings_closures" on fin_savings_closures for delete
  using (auth.uid() = user_id);
