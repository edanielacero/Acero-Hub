-- Ads Analizador · Sprint 1 — fundaciones.
-- Spec: documentos/ads_analizador/sprint_1_fundaciones_y_reglas.md
--
-- Una madre (las campañas que el usuario decidió trackear) y cuatro hijas que
-- cuelgan de campaign_id. Las hijas llevan su propio user_id para que el RLS
-- sea `auth.uid() = user_id` sin join, igual que gas_movimientos (§0.1).
--
-- La FK compuesta (campaign_id, user_id) → ads_campaigns(id, user_id) es lo que
-- impide que ese user_id denormalizado mienta: sin ella, alguien podría colgar
-- una fila suya de la campaña de otro usuario — la FK simple se chequea
-- saltándose RLS.

create table if not exists ads_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  meta_campaign_id   text not null,
  meta_ad_account_id text not null,
  nombre             text not null,
  moneda             text not null check (moneda in ('USD','BOB')),
  tipo_conversion    text not null check (tipo_conversion in ('compra_stripe','venta_manual')),
  precio_venta       numeric(10,2) not null check (precio_venta > 0),
  margen_venta       numeric(10,2) not null check (margen_venta > 0),
  -- null = automático (equilibrio × 1.35). Solo se guarda un override explícito.
  roas_objetivo      numeric(5,2) check (roas_objetivo is null or roas_objetivo > 0),
  activo             boolean not null default true,
  ultima_sync        timestamptz,
  created_at         timestamptz not null default now(),
  unique (user_id, meta_campaign_id),
  unique (id, user_id)
);

create index if not exists ads_campaigns_user_idx on ads_campaigns (user_id);

create table if not exists ads_metricas_diarias (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  campaign_id         uuid not null,
  fecha               date not null,
  gasto               numeric(12,2) not null default 0,
  alcance             int,
  impresiones         int,
  frecuencia          numeric(6,2),
  cpm                 numeric(12,4),
  clics_enlace        int,
  cpc_enlace          numeric(12,4),
  ctr_enlace          numeric(8,4),
  -- Evento optimizado según Meta: compra, o "conversación iniciada" en WhatsApp.
  -- NO es la venta real — esa está en ads_pagos_stripe / ads_ventas_manuales.
  resultados          int not null default 0,
  costo_por_resultado numeric(12,4),
  landing_page_views  int,
  pagos_iniciados     int,
  raw_json            jsonb,
  updated_at          timestamptz not null default now(),
  unique (campaign_id, fecha),
  foreign key (campaign_id, user_id) references ads_campaigns (id, user_id) on delete cascade
);

create index if not exists ads_metricas_user_idx on ads_metricas_diarias (user_id);

create table if not exists ads_ventas_manuales (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign_id  uuid not null,
  fecha        date not null,
  cantidad     int not null check (cantidad >= 0),
  nota         text,
  updated_at   timestamptz not null default now(),
  unique (campaign_id, fecha),
  foreign key (campaign_id, user_id) references ads_campaigns (id, user_id) on delete cascade
);

create index if not exists ads_ventas_user_idx on ads_ventas_manuales (user_id);

create table if not exists ads_pagos_stripe (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  campaign_id         uuid not null,
  fecha               date not null,
  compras_exitosas    int not null default 0,
  monto_total         numeric(12,2) not null default 0,
  pagos_fallidos      int not null default 0,
  pagos_incompletos   int not null default 0,
  tres_ds_solicitados int not null default 0,
  tres_ds_exitosos    int not null default 0,
  decline_reasons     jsonb,  -- {"do_not_honor": 3, "insufficient_funds": 1, ...}
  updated_at          timestamptz not null default now(),
  unique (campaign_id, fecha),
  foreign key (campaign_id, user_id) references ads_campaigns (id, user_id) on delete cascade
);

create index if not exists ads_pagos_user_idx on ads_pagos_stripe (user_id);

create table if not exists ads_cambios_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  fecha       timestamptz not null default now(),
  tipo        text not null check (tipo in ('presupuesto','creativo','audiencia','otro')),
  detalle     text,
  foreign key (campaign_id, user_id) references ads_campaigns (id, user_id) on delete cascade
);

create index if not exists ads_cambios_campaign_idx on ads_cambios_log (campaign_id, fecha desc);
create index if not exists ads_cambios_user_idx     on ads_cambios_log (user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Misma forma en las cinco: select/insert/update/delete contra
-- auth.uid() = user_id, sin join.

do $$
declare
  t text;
begin
  foreach t in array array[
    'ads_campaigns', 'ads_metricas_diarias', 'ads_ventas_manuales',
    'ads_pagos_stripe', 'ads_cambios_log'
  ]
  loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists "ads: ver propios" on %I', t);
    execute format('drop policy if exists "ads: crear propios" on %I', t);
    execute format('drop policy if exists "ads: actualizar propios" on %I', t);
    execute format('drop policy if exists "ads: borrar propios" on %I', t);

    execute format('create policy "ads: ver propios" on %I for select using (auth.uid() = user_id)', t);
    execute format('create policy "ads: crear propios" on %I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "ads: actualizar propios" on %I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "ads: borrar propios" on %I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ── Registro en el Hub ──────────────────────────────────────────────────
-- Sin esta fila el admin no puede darle acceso a nadie y la tarjeta no aparece.
insert into projects (name, slug, description)
values ('Ads Analizador', 'ads-analizador', 'Semáforo de campañas de Meta Ads')
on conflict (slug) do nothing;
