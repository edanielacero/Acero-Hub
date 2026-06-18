-- ============================================
-- ACERO HUB — Schema
-- Pega esto en el SQL Editor de Supabase
-- ============================================

-- PROFILES (extiende auth.users)
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz default now()
);

-- PROJECTS
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique not null,
  description text,
  created_at timestamptz default now()
);

-- PROJECT ACCESS
create table if not exists project_access (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  granted_by uuid references profiles(id),
  granted_at timestamptz default now(),
  unique(user_id, project_id)
);

-- INVITATIONS
create table if not exists invitations (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  name text,
  token text unique not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references profiles(id),
  project_ids uuid[] default '{}',
  created_at timestamptz default now()
);

-- ============================================
-- FUNCIÓN: helper para verificar si es admin
-- ============================================
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  )
$$;

-- ============================================
-- TRIGGER: crear perfil al registrarse
-- ============================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================
-- RLS (Row Level Security)
-- ============================================
alter table profiles      enable row level security;
alter table projects      enable row level security;
alter table project_access enable row level security;
alter table invitations   enable row level security;

-- Profiles
create policy "Leer propio perfil o admin" on profiles for select
  using (id = auth.uid() or is_admin());
create policy "Actualizar propio perfil" on profiles for update
  using (id = auth.uid());

-- Projects
create policy "Todos los autenticados leen proyectos" on projects for select
  to authenticated using (true);
create policy "Solo admin gestiona proyectos" on projects for all
  using (is_admin());

-- Project access
create policy "Leer propio acceso o admin" on project_access for select
  using (user_id = auth.uid() or is_admin());
create policy "Solo admin gestiona accesos" on project_access for all
  using (is_admin());

-- Invitations (solo via service role en API routes)
create policy "Solo admin lee invitaciones" on invitations for select
  using (is_admin());

-- ============================================
-- SEED: proyecto inicial
-- ============================================
insert into projects (name, slug, description)
values (
  'Trading Journal',
  'trading-journal',
  'Registro y análisis de operaciones. Estadísticas de rendimiento, gestión de riesgo y bitácora de decisiones.'
)
on conflict (slug) do nothing;

-- ============================================
-- SETUP INICIAL: convertir tu usuario en admin
-- Corre esto DESPUÉS de registrarte por primera vez
-- Reemplaza el email con el tuyo
-- ============================================
-- update profiles set role = 'admin' where email = 'tu@correo.com';
