-- Expandlogy: dashboard de organización de clientes para agencia de marketing.
-- Ver documentos/expandlogy/documento_maestro_expandlogy.md para el plan completo.

create table if not exists exp_clients (
  id                uuid default gen_random_uuid() primary key,
  name              text not null,
  industry          text,
  description       text,
  target_audience   text,
  brand_voice       text,
  goals             text,
  contact_name      text,
  contact_email     text,
  contact_phone     text,
  drive_link        text,
  status            text not null default 'onboarding' check (status in ('onboarding', 'active', 'paused', 'archived')),
  notes             text,
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists exp_client_access (
  id           uuid default gen_random_uuid() primary key,
  client_id    uuid references exp_clients(id) on delete cascade not null,
  user_id      uuid references profiles(id) on delete cascade not null,
  granted_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz default now(),
  unique(client_id, user_id)
);

create table if not exists exp_creatives (
  id            uuid default gen_random_uuid() primary key,
  client_id     uuid references exp_clients(id) on delete cascade not null,
  user_id       uuid references profiles(id) on delete set null,
  prompt        text not null,
  storage_path  text not null,
  size          text,
  quality       text,
  cost_usd      numeric,
  created_at    timestamptz default now()
);

create table if not exists exp_copies (
  id           uuid default gen_random_uuid() primary key,
  client_id    uuid references exp_clients(id) on delete cascade not null,
  user_id      uuid references profiles(id) on delete set null,
  prompt       text not null,
  content      text not null,
  platform     text not null default 'facebook_ads',
  created_at   timestamptz default now()
);

-- ============================================
-- ÍNDICES
-- ============================================
create index if not exists exp_client_access_client_id on exp_client_access(client_id);
create index if not exists exp_client_access_user_id   on exp_client_access(user_id);
create index if not exists exp_creatives_client_id     on exp_creatives(client_id);
create index if not exists exp_copies_client_id        on exp_copies(client_id);

-- ============================================
-- RLS
-- ============================================
alter table exp_clients        enable row level security;
alter table exp_client_access  enable row level security;
alter table exp_creatives      enable row level security;
alter table exp_copies         enable row level security;

-- exp_clients: visible solo si tenés acceso a ese cliente
create policy "exp: leer clientes con acceso" on exp_clients for select
  using (
    exists (select 1 from exp_client_access where client_id = id and user_id = auth.uid())
  );

-- exp_client_access: podés ver quién tiene acceso a un cliente si vos también lo tenés
create policy "exp: leer accesos de mis clientes" on exp_client_access for select
  using (
    exists (select 1 from exp_client_access a2 where a2.client_id = client_id and a2.user_id = auth.uid())
  );

-- exp_creatives: visibles si tenés acceso al cliente dueño
create policy "exp: leer creativos de mis clientes" on exp_creatives for select
  using (
    exists (select 1 from exp_client_access where client_id = exp_creatives.client_id and user_id = auth.uid())
  );

-- exp_copies: visibles si tenés acceso al cliente dueño
create policy "exp: leer copys de mis clientes" on exp_copies for select
  using (
    exists (select 1 from exp_client_access where client_id = exp_copies.client_id and user_id = auth.uid())
  );

-- ============================================
-- Registro en el Hub
-- ============================================
insert into projects (name, slug, description)
values (
  'Expandlogy',
  'expandlogy',
  'Organización de clientes, onboarding y generación de creativos/copys con IA'
)
on conflict (slug) do nothing;
