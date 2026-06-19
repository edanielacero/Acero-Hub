-- ============================================
-- MUNDIAL 2026 — Schema
-- ============================================

create table if not exists mundial_profiles (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  token text unique not null,
  color text not null default '#6366f1',
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists mundial_matches (
  id bigint primary key,
  home_team text not null,
  home_tla text,
  home_crest text,
  away_team text not null,
  away_tla text,
  away_crest text,
  match_date timestamptz not null,
  status text default 'SCHEDULED',
  home_score int,
  away_score int,
  stage text,
  group_name text,
  synced_at timestamptz default now()
);

create table if not exists mundial_bets (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references mundial_profiles(id) on delete cascade,
  match_id bigint references mundial_matches(id) on delete cascade,
  home_score_bet int not null,
  away_score_bet int not null,
  payment_confirmed boolean default false,
  prize_paid boolean default false,
  confirmed_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(profile_id, match_id)
);

create table if not exists mundial_settings (
  id int primary key default 1,
  qr_image_url text,
  bet_amount numeric default 5,
  pot_carryover numeric default 0,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

insert into mundial_settings (id) values (1) on conflict do nothing;

-- RLS
alter table mundial_profiles enable row level security;
alter table mundial_matches  enable row level security;
alter table mundial_bets     enable row level security;
alter table mundial_settings enable row level security;

create policy "Public read mundial_profiles" on mundial_profiles for select to anon, authenticated using (true);
create policy "Public read mundial_matches"  on mundial_matches  for select to anon, authenticated using (true);
create policy "Public read mundial_bets"     on mundial_bets     for select to anon, authenticated using (true);
create policy "Public read mundial_settings" on mundial_settings for select to anon, authenticated using (true);

-- Seed Mundial project into hub
insert into projects (name, slug, description)
values ('Mundial 2026', 'mundial-2026', 'Apuestas de resultados entre amigos para el Mundial 2026.')
on conflict (slug) do nothing;
