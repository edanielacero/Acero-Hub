-- Finanzas · Sprint 9: "Notificaciones"
--
-- Spec: documentos/finanzas/sprint_9_notificaciones.md
--
-- Push del navegador, evaluado cada 15 minutos por pg_cron. Tres tablas y una
-- columna:
--
--   fin_push_subscriptions  un dispositivo que aceptó recibir
--   fin_notif_prefs         qué tipos quiere el usuario, y a qué hora
--   fin_notifications       lo que YA se mandó — es lo que evita repetir
--   fin_profiles.notify     si este perfil genera avisos
--
-- Nada de esto guarda el ESTADO de un aviso ("ya avisé de este fijo"). El job
-- recalcula con las mismas funciones que usa la app y compara contra
-- fin_notifications. Mismo principio que el saldo de una cuenta (maestro §4.2):
-- derivado, nunca guardado. Un flag `ya_avisado` en fin_recurring se
-- desincronizaría el día que alguien edite el fijo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Los dispositivos suscritos
--
-- Es del USUARIO, no del perfil: un dispositivo es un dispositivo y recibe los
-- avisos de todos los perfiles que estén encendidos. El perfil se decide al
-- evaluar el aviso, no al suscribirse.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists fin_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- El endpoint ES la identidad del dispositivo para el navegador. Reinstalar
  -- la PWA genera uno nuevo; volver a activar en el mismo navegador devuelve el
  -- mismo. Sin el unique, cada visita a Ajustes sumaría una fila y llegarían
  -- avisos repetidos al mismo teléfono.
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,

  constraint fin_push_subscriptions_endpoint_key unique (endpoint)
);

create index if not exists fin_push_subs_user_idx
  on fin_push_subscriptions (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Preferencias por usuario
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists fin_notif_prefs (
  user_id            uuid primary key references auth.users(id) on delete cascade,

  -- Un switch por tipo de aviso. Encendidos por defecto: quien activa el push
  -- lo hace porque quiere que le avisen; apagar es la excepción.
  fijos              boolean not null default true,
  presupuesto        boolean not null default true,
  ahorro             boolean not null default true,
  deudas             boolean not null default true,
  recordar_anotar    boolean not null default true,

  -- Los dos recordatorios de anotar, en HORA LOCAL del usuario. El job corre en
  -- UTC, así que sin la zona el de la noche llegaría a las 17:00 en Bolivia —
  -- el mismo problema que los Sprints 6 y 7 resolvieron pasando `today` desde
  -- el cliente.
  recordar_mediodia  time not null default '14:00',
  recordar_noche     time not null default '21:00',
  timezone           text not null default 'America/La_Paz',

  updated_at         timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Si un perfil notifica o no
--
-- Columna y no tabla aparte: es un solo booleano por perfil, y así viaja gratis
-- en el PROFILE_COLS que Ajustes ya lee.
--
-- Se combina con las preferencias por Y: un aviso sale si su TIPO está
-- encendido y además el PERFIL del que nace tiene notify.
-- ─────────────────────────────────────────────────────────────────────────────

alter table fin_profiles
  add column if not exists notify boolean not null default true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Lo que ya se mandó
--
-- La tabla que hace posible "al momento" sin repetir. El job corre cada 15
-- minutos; sin esto, un fijo vencido avisaría 96 veces por día — que es la
-- forma más rápida de que el usuario apague las notificaciones para siempre.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists fin_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Nullable a propósito: el recordatorio de anotar no sale de ningún perfil.
  profile_id  uuid references fin_profiles(id) on delete cascade,

  kind        text not null
                check (kind in ('fijos','presupuesto','ahorro','deudas','recordar_anotar')),

  -- La identidad del HECHO, no del aviso: "el fijo X del período 2026-09".
  -- El período va adentro porque un fijo vence todos los meses: sin él, el
  -- aviso de septiembre nunca saldría porque el de agosto ya está en la tabla.
  dedupe_key  text not null,

  title       text not null,
  body        text not null,
  url         text,
  sent_at     timestamptz not null default now(),

  constraint fin_notifications_dedupe_key unique (user_id, dedupe_key)
);

create index if not exists fin_notifications_user_idx
  on fin_notifications (user_id, sent_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS
--
-- fin_notifications la escribe la Edge Function con la service role key, que
-- salta RLS: es un registro del sistema, no algo que el usuario cree. Su policy
-- de select existe igual, por si algún día se muestra el historial.
-- ─────────────────────────────────────────────────────────────────────────────

alter table fin_push_subscriptions enable row level security;
alter table fin_notif_prefs        enable row level security;
alter table fin_notifications      enable row level security;

drop policy if exists "fin: ver propias suscripciones"        on fin_push_subscriptions;
drop policy if exists "fin: crear propias suscripciones"      on fin_push_subscriptions;
drop policy if exists "fin: actualizar propias suscripciones" on fin_push_subscriptions;
drop policy if exists "fin: borrar propias suscripciones"     on fin_push_subscriptions;

create policy "fin: ver propias suscripciones" on fin_push_subscriptions for select
  using (auth.uid() = user_id);
create policy "fin: crear propias suscripciones" on fin_push_subscriptions for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propias suscripciones" on fin_push_subscriptions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propias suscripciones" on fin_push_subscriptions for delete
  using (auth.uid() = user_id);

drop policy if exists "fin: ver propias prefs"        on fin_notif_prefs;
drop policy if exists "fin: crear propias prefs"      on fin_notif_prefs;
drop policy if exists "fin: actualizar propias prefs" on fin_notif_prefs;

create policy "fin: ver propias prefs" on fin_notif_prefs for select
  using (auth.uid() = user_id);
create policy "fin: crear propias prefs" on fin_notif_prefs for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propias prefs" on fin_notif_prefs for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "fin: ver propias notificaciones" on fin_notifications;

create policy "fin: ver propias notificaciones" on fin_notifications for select
  using (auth.uid() = user_id);
