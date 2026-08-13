-- Finanzas — Sprint 2: transacciones y reglas de auto-categorización.
-- Ver documentos/finanzas/documento_maestro_finanzas.md para el roadmap completo.

create table if not exists fin_transactions (
  id                   uuid default gen_random_uuid() primary key,
  user_id              uuid references profiles(id) on delete cascade not null,
  type                 text not null check (type in (
                          'ingreso', 'gasto', 'transferencia', 'inversion', 'retiro_inversion',
                          'reembolso', 'pago_deuda_por_cobrar', 'ajuste_patrimonio',
                          'aporte_objetivo', 'aporte_pasanaku', 'recepcion_pasanaku'
                        )),
  flow_type            text not null check (flow_type in ('consumo', 'movimiento')),
  account_id           uuid references fin_accounts(id) on delete cascade not null,
  to_account_id        uuid references fin_accounts(id) on delete cascade,
  category_id          uuid references fin_categories(id) on delete set null,
  amount               numeric not null,
  currency             text not null check (currency in ('USD', 'BOB')),
  exchange_rate_used   numeric,
  amount_usd           numeric not null,
  date                 date not null,
  description          text,
  tags                 text[] not null default '{}',
  is_shared            boolean not null default false,
  status               text not null default 'completada' check (status in ('pendiente', 'completada')),
  notes                text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  -- El monto siempre es positivo, salvo ajuste_patrimonio que puede corregir hacia
  -- abajo (su signo se aplica tal cual al saldo — ver lib/finanzas/transactions.ts).
  check (
    (type = 'ajuste_patrimonio' and amount <> 0) or
    (type <> 'ajuste_patrimonio' and amount > 0)
  ),
  check (account_id <> to_account_id)
);

create table if not exists fin_category_rules (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references profiles(id) on delete cascade not null,
  keyword      text not null,
  category_id  uuid references fin_categories(id) on delete cascade not null,
  priority     int not null default 0,
  created_at   timestamptz default now()
);

-- ============================================
-- ÍNDICES
-- ============================================
create index if not exists fin_transactions_user_id      on fin_transactions(user_id, date desc);
create index if not exists fin_transactions_account_id   on fin_transactions(account_id);
create index if not exists fin_transactions_to_account_id on fin_transactions(to_account_id);
create index if not exists fin_transactions_category_id  on fin_transactions(category_id);
create index if not exists fin_category_rules_user_id    on fin_category_rules(user_id);

-- ============================================
-- RLS
-- ============================================
alter table fin_transactions    enable row level security;
alter table fin_category_rules  enable row level security;

create policy "fin: leer propias transacciones" on fin_transactions for select
  using (user_id = auth.uid());

create policy "fin: leer propias reglas de categoria" on fin_category_rules for select
  using (user_id = auth.uid());
