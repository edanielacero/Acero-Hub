-- Finanzas — Perfiles: separar ingresos/egresos entre distintos "sombreros"
-- (ej. Personal vs. LLC) sin dividir el patrimonio, que sigue compartido.
-- Ver documentos/finanzas/documento_maestro_finanzas.md.

create table if not exists fin_profiles (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  name        text not null,
  is_default  boolean not null default false,
  created_at  timestamptz default now()
);

-- Nullable: solo es relevante para transacciones type='ingreso'|'gasto' (que son
-- las que se dividen entre perfiles); el resto de los tipos no lo usan. Si se borra
-- el perfil, la transacción se queda sin etiquetar en vez de perderse.
alter table fin_transactions add column if not exists profile_id uuid references fin_profiles(id) on delete set null;

create index if not exists fin_profiles_user_id       on fin_profiles(user_id);
create index if not exists fin_transactions_profile_id on fin_transactions(profile_id);

alter table fin_profiles enable row level security;

create policy "fin: leer propios perfiles" on fin_profiles for select
  using (user_id = auth.uid());
