-- Depósitos y retiros de capital en journals (no afectan % de rentabilidad de trades)

create table if not exists tj_capital_transactions (
  id         uuid default gen_random_uuid() primary key,
  session_id uuid references tj_sessions(id) on delete cascade not null,
  type       text not null check (type in ('deposit', 'withdrawal')),
  amount     numeric not null check (amount > 0),
  date       timestamptz not null,
  note       text,
  created_at timestamptz default now()
);

create index if not exists tj_capital_transactions_session_id
  on tj_capital_transactions(session_id, date);

alter table tj_capital_transactions enable row level security;

-- tj_capital_transactions: si el usuario es dueño de la sesión
create policy "tj: leer propios movimientos de capital" on tj_capital_transactions for select
  using (
    exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid())
  );
