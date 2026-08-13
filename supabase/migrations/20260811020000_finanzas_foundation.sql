-- Finanzas — Sprint 1: cuentas, valuaciones de activos, categorías jerárquicas
-- y tipo de cambio. Ver documentos/finanzas/documento_maestro_finanzas.md para
-- el roadmap completo de sprints.

create table if not exists fin_accounts (
  id                   uuid default gen_random_uuid() primary key,
  user_id              uuid references profiles(id) on delete cascade not null,
  name                 text not null,
  type                 text not null check (type in ('efectivo', 'cuenta_bancaria', 'ahorro', 'inversion', 'cripto', 'trading', 'otro')),
  currency             text not null check (currency in ('USD', 'BOB')),
  initial_balance      numeric not null default 0,
  initial_balance_date date not null default current_date,
  archived             boolean not null default false,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- Snapshots de valuación para cuentas de tipo inversion/cripto/trading — el valor
-- cambia por mercado, no por transacciones propias, así que no se deriva como el
-- resto de los saldos (ver lib/finanzas/accounts.ts).
create table if not exists fin_asset_valuations (
  id          uuid default gen_random_uuid() primary key,
  account_id  uuid references fin_accounts(id) on delete cascade not null,
  value_usd   numeric not null check (value_usd >= 0),
  valued_at   timestamptz not null default now(),
  source      text not null default 'manual' check (source in ('manual', 'auto_btc')),
  note        text,
  created_at  timestamptz default now()
);

create table if not exists fin_categories (
  id                  uuid default gen_random_uuid() primary key,
  user_id             uuid references profiles(id) on delete cascade not null,
  parent_category_id  uuid references fin_categories(id) on delete cascade,
  name                text not null,
  kind                text not null check (kind in ('ingreso', 'gasto')),
  created_at          timestamptz default now()
);

create table if not exists fin_exchange_rates (
  id                  uuid default gen_random_uuid() primary key,
  user_id             uuid references profiles(id) on delete cascade not null,
  pair                text not null check (pair in ('USD_BOB', 'BOB_USDT', 'BTC_USDT')),
  rate                numeric not null check (rate > 0),
  source              text not null,
  fetched_at          timestamptz not null default now(),
  is_manual_override  boolean not null default false,
  created_at          timestamptz default now()
);

-- ============================================
-- ÍNDICES
-- ============================================
create index if not exists fin_accounts_user_id            on fin_accounts(user_id);
create index if not exists fin_asset_valuations_account_id on fin_asset_valuations(account_id, valued_at desc);
create index if not exists fin_categories_user_id          on fin_categories(user_id);
create index if not exists fin_categories_parent_id        on fin_categories(parent_category_id);
create index if not exists fin_exchange_rates_lookup        on fin_exchange_rates(user_id, pair, fetched_at desc);

-- ============================================
-- RLS
-- ============================================
alter table fin_accounts          enable row level security;
alter table fin_asset_valuations  enable row level security;
alter table fin_categories        enable row level security;
alter table fin_exchange_rates    enable row level security;

-- fin_accounts: solo las propias
create policy "fin: leer propias cuentas" on fin_accounts for select
  using (user_id = auth.uid());

-- fin_asset_valuations: si el usuario es dueño de la cuenta
create policy "fin: leer propias valuaciones" on fin_asset_valuations for select
  using (
    exists (select 1 from fin_accounts where id = account_id and user_id = auth.uid())
  );

-- fin_categories: solo las propias
create policy "fin: leer propias categorias" on fin_categories for select
  using (user_id = auth.uid());

-- fin_exchange_rates: solo las propias
create policy "fin: leer propias tasas de cambio" on fin_exchange_rates for select
  using (user_id = auth.uid());
