-- Ads Analizador · ciclos guardados (cierre de ciclo y «Campaña en curso").
-- Spec: documentos/ads_analizador/sprint_6_cierre_de_ciclo.md
--
-- Un ciclo se abre con el primer gasto o con un cambio registrado. Su duración
-- (dias_ciclo) se fija al terminar el día 1 y no se modifica. Al llegar a su
-- último día se cierra solo y guarda un snapshot con los valores ya
-- calculados; el panel queda congelado hasta que el usuario lo confirma
-- (revisado_en). Los ciclos anteriores a esta migración no tienen fila: la app
-- los sigue mostrando solo con su semáforo, sin rellenar datos.

create table if not exists ads_ciclos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign_id  uuid not null,
  inicio       date not null,
  -- Último día del ciclo (incluido). Null mientras está abierto.
  fin          date,
  dias_ciclo   int check (dias_ciclo is null or (dias_ciclo between 1 and 365)),
  estado       text not null default 'abierto'
    check (estado in ('abierto', 'cerrado', 'cortado', 'interrumpido')),
  snapshot     jsonb,
  cerrado_en   timestamptz,
  revisado_en  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (campaign_id, inicio),
  foreign key (campaign_id, user_id) references ads_campaigns (id, user_id) on delete cascade
);

create index if not exists ads_ciclos_user_idx on ads_ciclos (user_id);

alter table ads_ciclos enable row level security;
drop policy if exists "ads: ver propios" on ads_ciclos;
drop policy if exists "ads: crear propios" on ads_ciclos;
drop policy if exists "ads: actualizar propios" on ads_ciclos;
drop policy if exists "ads: borrar propios" on ads_ciclos;
create policy "ads: ver propios" on ads_ciclos for select using (auth.uid() = user_id);
create policy "ads: crear propios" on ads_ciclos for insert with check (auth.uid() = user_id);
create policy "ads: actualizar propios" on ads_ciclos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ads: borrar propios" on ads_ciclos for delete using (auth.uid() = user_id);
