-- Finanzas · Sprint 1 "Movimientos"
-- Ver documentos/finanzas/documento_maestro_finanzas.md §3
--
-- 4 tablas. El saldo de una cuenta NO se guarda: se deriva de los movimientos
-- (§4.2). Por eso no hay ninguna columna `balance` acá.

-- ─────────────────────────────────────────────────────────────────────────────
-- fin_settings — una fila por usuario. Guarda la tasa manual USD/BOB.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists fin_settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  usd_bob_rate  numeric(12,4) not null default 6.96 check (usd_bob_rate > 0),
  updated_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- fin_accounts
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists fin_accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null,
  currency              text not null check (currency in ('USD','BOB')),
  initial_balance       numeric(14,2) not null default 0,
  initial_balance_date  date not null default current_date,
  sort_order            integer not null default 0,
  archived              boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists fin_accounts_user_idx
  on fin_accounts (user_id, archived, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- fin_categories — plana a propósito, sin parent_id (§3.3)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists fin_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('gasto','ingreso')),
  emoji       text,
  sort_order  integer not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists fin_categories_user_idx
  on fin_categories (user_id, kind, archived, sort_order);

-- Evita categorías duplicadas dentro del mismo tipo. Respalda a nivel de base
-- la idempotencia del seed (§6 POST /api/finanzas/seed) y hace fallar de forma
-- ruidosa un rename que colisione con otra categoría existente.
create unique index if not exists fin_categories_unique_name
  on fin_categories (user_id, kind, name);

-- ─────────────────────────────────────────────────────────────────────────────
-- fin_transactions
--   · amount siempre positivo; el signo lo da el `type`
--   · exchange_rate y amount_usd se congelan al escribir y nunca se recalculan
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists fin_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  type           text not null check (type in ('gasto','ingreso','transferencia')),
  date           date not null,
  account_id     uuid not null references fin_accounts(id) on delete restrict,
  to_account_id  uuid references fin_accounts(id) on delete restrict,
  category_id    uuid references fin_categories(id) on delete set null,
  amount         numeric(14,2) not null check (amount > 0),
  currency       text not null check (currency in ('USD','BOB')),
  to_amount      numeric(14,2) check (to_amount is null or to_amount > 0),
  exchange_rate  numeric(12,4) not null check (exchange_rate > 0),
  amount_usd     numeric(14,2) not null,
  description    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint fin_tx_transfer_shape check (
    (type = 'transferencia'
      and to_account_id is not null
      and to_account_id <> account_id
      and category_id is null)
    or
    (type in ('gasto','ingreso')
      and to_account_id is null
      and to_amount is null)
  )
);
create index if not exists fin_transactions_user_date_idx
  on fin_transactions (user_id, date desc);
create index if not exists fin_transactions_account_idx
  on fin_transactions (account_id);
create index if not exists fin_transactions_to_account_idx
  on fin_transactions (to_account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — las 4 tablas, las 4 policies cada una, todas por user_id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
alter table fin_settings     enable row level security;
alter table fin_accounts     enable row level security;
alter table fin_categories   enable row level security;
alter table fin_transactions enable row level security;

-- fin_settings
create policy "fin: ver propios ajustes" on fin_settings for select
  using (user_id = auth.uid());
create policy "fin: crear propios ajustes" on fin_settings for insert
  with check (user_id = auth.uid());
create policy "fin: actualizar propios ajustes" on fin_settings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "fin: borrar propios ajustes" on fin_settings for delete
  using (user_id = auth.uid());

-- fin_accounts
create policy "fin: ver propias cuentas" on fin_accounts for select
  using (user_id = auth.uid());
create policy "fin: crear propias cuentas" on fin_accounts for insert
  with check (user_id = auth.uid());
create policy "fin: actualizar propias cuentas" on fin_accounts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "fin: borrar propias cuentas" on fin_accounts for delete
  using (user_id = auth.uid());

-- fin_categories
create policy "fin: ver propias categorias" on fin_categories for select
  using (user_id = auth.uid());
create policy "fin: crear propias categorias" on fin_categories for insert
  with check (user_id = auth.uid());
create policy "fin: actualizar propias categorias" on fin_categories for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "fin: borrar propias categorias" on fin_categories for delete
  using (user_id = auth.uid());

-- fin_transactions
create policy "fin: ver propias transacciones" on fin_transactions for select
  using (user_id = auth.uid());
create policy "fin: crear propias transacciones" on fin_transactions for insert
  with check (user_id = auth.uid());
create policy "fin: actualizar propias transacciones" on fin_transactions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "fin: borrar propias transacciones" on fin_transactions for delete
  using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Registro en el Hub (§3.6). El reset del 2026-08-17 borró esta fila.
-- ─────────────────────────────────────────────────────────────────────────────
insert into projects (name, slug, description)
values ('Finanzas', 'finanzas', 'Finanzas personales')
on conflict (slug) do nothing;
