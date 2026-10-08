-- Ads Analizador · reglas v2 (Low Ticket / High Ticket).
-- Spec: documentos/ads_analizador/sprint_5_reglas_v2.md
--
-- Campos nuevos por campaña:
--   cpa_esperado        costo esperado por conversión (opcional; si es null la
--                       app lo resuelve: costo real ≥ 5 ventas → campaña
--                       comparable → margen)
--   modo_corte          'conservador' (corte al día 5) o 'estandar' (día 3)
--   show/close_estimado tasas de asistencia y cierre (solo llamadas)
--   capacidad_chats_dia cuántas conversaciones por día puede atender el usuario
--                       (solo WhatsApp; para el aviso de capacidad)
-- Tipo nuevo: 'llamadas' (High Ticket, agendamiento).

alter table ads_campaigns
  add column if not exists cpa_esperado numeric(12,2)
    check (cpa_esperado is null or cpa_esperado > 0),
  add column if not exists modo_corte text not null default 'conservador'
    check (modo_corte in ('conservador', 'estandar')),
  add column if not exists show_estimado numeric(4,3)
    check (show_estimado is null or (show_estimado > 0 and show_estimado <= 1)),
  add column if not exists close_estimado numeric(4,3)
    check (close_estimado is null or (close_estimado > 0 and close_estimado <= 1)),
  add column if not exists capacidad_chats_dia int
    check (capacidad_chats_dia is null or capacidad_chats_dia > 0);

alter table ads_campaigns drop constraint if exists ads_campaigns_tipo_conversion_check;
alter table ads_campaigns add constraint ads_campaigns_tipo_conversion_check
  check (tipo_conversion in ('compra_stripe', 'venta_manual', 'llamadas'));

-- El monto del presupuesto después de un cambio: la app lo usa para la reserva,
-- la pérdida máxima y el paso de escalado.
alter table ads_cambios_log
  add column if not exists presupuesto numeric(12,2)
    check (presupuesto is null or presupuesto > 0);

-- High Ticket: llamadas por FECHA DE LA LLAMADA (no del cierre).
create table if not exists ads_llamadas (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign_id  uuid not null,
  fecha        date not null,
  agendadas    int not null default 0 check (agendadas >= 0),
  calificadas  int check (calificadas is null or calificadas >= 0),
  asistidas    int not null default 0 check (asistidas >= 0),
  cerradas     int not null default 0 check (cerradas >= 0),
  nota         text,
  updated_at   timestamptz not null default now(),
  unique (campaign_id, fecha),
  foreign key (campaign_id, user_id) references ads_campaigns (id, user_id) on delete cascade
);

create index if not exists ads_llamadas_user_idx on ads_llamadas (user_id);

alter table ads_llamadas enable row level security;
drop policy if exists "ads: ver propios" on ads_llamadas;
drop policy if exists "ads: crear propios" on ads_llamadas;
drop policy if exists "ads: actualizar propios" on ads_llamadas;
drop policy if exists "ads: borrar propios" on ads_llamadas;
create policy "ads: ver propios" on ads_llamadas for select using (auth.uid() = user_id);
create policy "ads: crear propios" on ads_llamadas for insert with check (auth.uid() = user_id);
create policy "ads: actualizar propios" on ads_llamadas for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ads: borrar propios" on ads_llamadas for delete using (auth.uid() = user_id);
