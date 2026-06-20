-- ============================================
-- TRADING JOURNAL — Schema
-- ============================================

-- SESSIONS (backtesting y journal)
create table if not exists tj_sessions (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  type            text not null check (type in ('backtesting', 'journal')),
  name            text not null,
  description     text,
  instrument      text,
  risk_percent    numeric default 1,
  capital_initial numeric,
  is_archived     boolean default false,
  is_favorite     boolean default false,
  sync_paused     boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- SESSION CONNECTIONS (backtesting → journal, N:M)
create table if not exists tj_session_connections (
  id              uuid default gen_random_uuid() primary key,
  backtesting_id  uuid references tj_sessions(id) on delete cascade not null,
  journal_id      uuid references tj_sessions(id) on delete cascade not null,
  sync_paused     boolean default false,
  created_at      timestamptz default now(),
  unique(backtesting_id, journal_id)
);

-- VARIABLE DEFINITIONS (schema de variables por sesión)
create table if not exists tj_variable_definitions (
  id          uuid default gen_random_uuid() primary key,
  session_id  uuid references tj_sessions(id) on delete cascade not null,
  key         text not null,
  label       text not null,
  type        text not null check (type in ('text', 'number', 'select_single', 'select_multiple', 'boolean')),
  options     jsonb,
  is_preset   boolean default false,
  is_required boolean default false,
  sort_order  int default 0,
  created_at  timestamptz default now(),
  unique(session_id, key)
);

-- TRADES
create table if not exists tj_trades (
  id              uuid default gen_random_uuid() primary key,
  session_id      uuid references tj_sessions(id) on delete cascade not null,
  linked_trade_id uuid references tj_trades(id) on delete set null,

  -- Campos fijos
  date_entry      timestamptz not null,
  date_exit       timestamptz,
  instrument      text,
  direction       text check (direction in ('long', 'short')),
  result          text check (result in ('tp', 'sl', 'be')),
  rr_target       numeric,
  rr_max          numeric,
  rr_exit         numeric,
  be_moved        boolean default false,
  notes           text,

  -- Solo journal
  pnl_usd         numeric,
  capital_start   numeric,
  capital_end     numeric,

  -- Variables opcionales y personalizadas
  custom_fields   jsonb default '{}'::jsonb,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- SHARE INVITATIONS
create table if not exists tj_share_invitations (
  id            uuid default gen_random_uuid() primary key,
  from_user_id  uuid references profiles(id) on delete cascade not null,
  to_email      text not null,
  session_id    uuid references tj_sessions(id) on delete cascade not null,
  status        text default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at    timestamptz default now()
);

-- NOTIFICATIONS
create table if not exists tj_notifications (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  type        text not null default 'session_share',
  payload     jsonb default '{}'::jsonb,
  read        boolean default false,
  created_at  timestamptz default now()
);

-- AI ANALYSES HISTORY
create table if not exists tj_ai_analyses (
  id          uuid default gen_random_uuid() primary key,
  session_id  uuid references tj_sessions(id) on delete cascade not null,
  prompt      text not null,
  response    text not null,
  created_at  timestamptz default now()
);

-- ============================================
-- ÍNDICES
-- ============================================
create index if not exists tj_sessions_user_id        on tj_sessions(user_id);
create index if not exists tj_trades_session_id       on tj_trades(session_id);
create index if not exists tj_trades_date_entry       on tj_trades(date_entry);
create index if not exists tj_vardefs_session_id      on tj_variable_definitions(session_id);
create index if not exists tj_notifications_user_id   on tj_notifications(user_id, read);
create index if not exists tj_trades_custom_fields    on tj_trades using gin(custom_fields);

-- ============================================
-- RLS
-- ============================================
alter table tj_sessions             enable row level security;
alter table tj_session_connections  enable row level security;
alter table tj_variable_definitions enable row level security;
alter table tj_trades               enable row level security;
alter table tj_share_invitations    enable row level security;
alter table tj_notifications        enable row level security;
alter table tj_ai_analyses          enable row level security;

-- tj_sessions: cada usuario ve solo las suyas
create policy "tj: leer propias sesiones" on tj_sessions for select
  using (user_id = auth.uid());

-- tj_session_connections: si el usuario es dueño de alguna de las dos sesiones
create policy "tj: leer propias conexiones" on tj_session_connections for select
  using (
    exists (select 1 from tj_sessions where id = backtesting_id and user_id = auth.uid())
    or
    exists (select 1 from tj_sessions where id = journal_id   and user_id = auth.uid())
  );

-- tj_variable_definitions: si el usuario es dueño de la sesión
create policy "tj: leer propias variables" on tj_variable_definitions for select
  using (
    exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid())
  );

-- tj_trades: si el usuario es dueño de la sesión
create policy "tj: leer propios trades" on tj_trades for select
  using (
    exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid())
  );

-- tj_share_invitations: si enviaste o eres el receptor
create policy "tj: leer invitaciones enviadas"  on tj_share_invitations for select
  using (from_user_id = auth.uid());
create policy "tj: leer invitaciones recibidas" on tj_share_invitations for select
  using (to_email = (select email from profiles where id = auth.uid()));

-- tj_notifications: solo las tuyas
create policy "tj: leer propias notificaciones" on tj_notifications for select
  using (user_id = auth.uid());

-- tj_ai_analyses: si el usuario es dueño de la sesión
create policy "tj: leer propios análisis IA" on tj_ai_analyses for select
  using (
    exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid())
  );
