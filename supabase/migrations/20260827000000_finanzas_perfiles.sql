-- Finanzas · Sprint 8: "Perfiles"
--
-- Spec: documentos/finanzas/sprint_8_perfiles.md
--
-- Un usuario puede tener N juegos de finanzas aislados entre sí. No hay tipos
-- (personal/empresa): lo que distingue a un perfil es su nombre y su color.
--
-- El orden de esta migración es el del §3.6 y no es negociable:
--   1. fin_profiles
--   2. un default por usuario que ya tenga datos
--   3. profile_id NULLABLE en las 17 tablas + backfill
--   4. NOT NULL  ← el paso que verifica que el backfill fue completo
--   5. índices, únicos y FKs compuestas — todo lo que necesita profile_id poblado
--
-- ⚠️ No confundir con `profiles` (la identidad del Hub), que no se toca. Y ojo
-- con el fantasma: entre el 13 y el 17 de agosto existió otro `fin_profiles`
-- cuyo modelo era el opuesto (etiqueta en fin_transactions, patrimonio
-- compartido). Se borró en 20260817000000. Este no tiene nada que ver.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fin_profiles
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists fin_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  -- Clave de paleta, no un hex: los colores viven en theme.css y acá se guarda
  -- cuál le toca. Un hex suelto dejaría al perfil fuera del sistema de color y
  -- permitiría guardar el azul, que significa "ahorro" en toda la app.
  accent      text not null default 'verde'
                check (accent in ('verde','naranja','violeta','magenta','teal')),
  is_default  boolean not null default false,
  archived    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- El selector sería ambiguo con dos perfiles del mismo nombre, y el error de
  -- registrar en el equivocado es irreversible (no se mueven movimientos).
  constraint fin_profiles_unique_name unique (user_id, name),
  -- El default nunca se archiva. Lo garantiza la base, no solo el server.
  constraint fin_profiles_default_no_archivado check (not (is_default and archived))
);

-- Exactamente un default por usuario.
create unique index if not exists fin_profiles_one_default
  on fin_profiles (user_id) where is_default;

create index if not exists fin_profiles_user_idx
  on fin_profiles (user_id, archived, sort_order);

-- Respalda la FK compuesta (profile_id, user_id) que llevan las 17 tablas: es
-- lo que hace imposible escribir un profile_id de OTRO usuario. Sin esto haría
-- falta reescribir las 68 policies de insert/update una por una.
alter table fin_profiles drop constraint if exists fin_profiles_id_user;
alter table fin_profiles add constraint fin_profiles_id_user unique (id, user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Un default por cada usuario que ya tenga algo cargado
--
-- Los usuarios sin datos no aparecen acá y no hace falta: su perfil se crea en
-- el primer /bootstrap, igual que ensureRates. Una migración no puede conocer
-- el auth.uid() de alguien que todavía no entró.
-- ─────────────────────────────────────────────────────────────────────────────

-- Se barren las 17, no un subconjunto "representativo": basta una fila suelta
-- en una tabla no listada para que su usuario se quede sin default y el paso 4
-- haga fallar la migración entera.
do $$
declare
  t text;
  tablas text[] := array[
    'fin_accounts', 'fin_transactions', 'fin_categories', 'fin_people',
    'fin_debts', 'fin_debt_plans', 'fin_recurring', 'fin_recurring_splits',
    'fin_pasanaku', 'fin_pasanaku_historico', 'fin_budget_periods',
    'fin_budget_lines', 'fin_budget_line_categories', 'fin_budget_extensions',
    'fin_budget_closures', 'fin_savings_goals', 'fin_savings_closures'
  ];
begin
  foreach t in array tablas loop
    execute format(
      'insert into fin_profiles (user_id, name, accent, is_default, sort_order)
       select distinct user_id, ''Personal'', ''verde'', true, 0 from %I
       on conflict (user_id, name) do nothing', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 y 4. profile_id en las 17 tablas: nullable → backfill → not null → FK
--
-- `on delete restrict` y no `cascade`: es lo que hace que borrar un perfil con
-- movimientos falle EN LA BASE aunque falle la validación del server. Misma
-- garantía que la FK de cuentas (maestro §4.5).
--
-- La FK es compuesta contra (id, user_id) para que profile_id y user_id no
-- puedan quedar en desacuerdo: escribir el perfil de otro usuario es imposible.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tablas text[] := array[
    'fin_accounts', 'fin_transactions', 'fin_categories', 'fin_people',
    'fin_debts', 'fin_debt_plans', 'fin_recurring', 'fin_recurring_splits',
    'fin_pasanaku', 'fin_pasanaku_historico', 'fin_budget_periods',
    'fin_budget_lines', 'fin_budget_line_categories', 'fin_budget_extensions',
    'fin_budget_closures', 'fin_savings_goals', 'fin_savings_closures'
  ];
begin
  foreach t in array tablas loop
    execute format('alter table %I add column if not exists profile_id uuid', t);

    execute format(
      'update %I t set profile_id = p.id from fin_profiles p
        where p.user_id = t.user_id and p.is_default and t.profile_id is null', t);

    -- Si el backfill dejó algo afuera, esto revienta la migración entera en vez
    -- de dejar filas invisibles para siempre.
    execute format('alter table %I alter column profile_id set not null', t);

    execute format('alter table %I drop constraint if exists %I', t, t || '_profile_fk');
    execute format(
      'alter table %I add constraint %I
         foreign key (profile_id, user_id) references fin_profiles (id, user_id)
         on delete restrict', t, t || '_profile_fk');

    -- El índice va en el paso 5: cada tabla recibe el compuesto que reemplaza a
    -- su viejo *_user_idx, y ese ya encabeza por profile_id. Crear acá uno
    -- suelto de (profile_id) sería redundante con él.
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5a. Índices: los 15 *_user_idx pasan a encabezar por profile_id
--
-- `profile_id` reemplaza a `user_id`, no se le suma: toda consulta del dominio
-- filtra por perfil, y el perfil ya implica al usuario (lo garantiza la FK
-- compuesta de arriba).
-- ─────────────────────────────────────────────────────────────────────────────

drop index if exists fin_accounts_user_idx;
create index if not exists fin_accounts_profile_idx
  on fin_accounts (profile_id, archived, sort_order);

drop index if exists fin_categories_user_idx;
create index if not exists fin_categories_profile_idx
  on fin_categories (profile_id, kind, archived, sort_order);

drop index if exists fin_transactions_user_date_idx;
create index if not exists fin_transactions_profile_date_idx
  on fin_transactions (profile_id, date desc);

drop index if exists fin_transactions_recurring_idx;
create index if not exists fin_transactions_profile_recurring_idx
  on fin_transactions (profile_id, recurring_id, date);

drop index if exists fin_transactions_pasanaku_idx;
create index if not exists fin_transactions_profile_pasanaku_idx
  on fin_transactions (profile_id, pasanaku_id, date);

drop index if exists fin_tx_savings_period_idx;
create index if not exists fin_tx_profile_savings_period_idx
  on fin_transactions (profile_id, savings_goal_id, savings_period)
  where savings_period is not null;

drop index if exists fin_people_user_idx;
create index if not exists fin_people_profile_idx
  on fin_people (profile_id, archived, sort_order);

drop index if exists fin_debts_user_incurred_idx;
create index if not exists fin_debts_profile_incurred_idx
  on fin_debts (profile_id, incurred_on desc);

drop index if exists fin_debts_user_open_idx;
create index if not exists fin_debts_profile_open_idx
  on fin_debts (profile_id) where settled_tx_id is null and waived_at is null;

drop index if exists fin_recurring_user_idx;
create index if not exists fin_recurring_profile_idx
  on fin_recurring (profile_id, active, day_of_month);

drop index if exists fin_pasanaku_user_idx;
create index if not exists fin_pasanaku_profile_idx
  on fin_pasanaku (profile_id, archived);

drop index if exists fin_budget_periods_user_idx;
create index if not exists fin_budget_periods_profile_idx
  on fin_budget_periods (profile_id, period);

drop index if exists fin_budget_closures_user_idx;
create index if not exists fin_budget_closures_profile_idx
  on fin_budget_closures (profile_id, period);

drop index if exists fin_savings_goals_user_idx;
create index if not exists fin_savings_goals_profile_idx
  on fin_savings_goals (profile_id, archived, sort_order);

drop index if exists fin_savings_closures_user_idx;
create index if not exists fin_savings_closures_profile_idx
  on fin_savings_closures (profile_id, period);

-- Las cuatro tablas sin *_user_idx propio (cuelgan de un padre) igual necesitan
-- poder filtrarse por perfil sin escanear.
create index if not exists fin_debt_plans_profile_idx        on fin_debt_plans (profile_id);
create index if not exists fin_recurring_splits_profile_idx  on fin_recurring_splits (profile_id);
create index if not exists fin_pasanaku_historico_profile_idx on fin_pasanaku_historico (profile_id);
create index if not exists fin_budget_extensions_profile_idx on fin_budget_extensions (profile_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5b. Los cinco únicos que cambian de alcance (§3.2.1)
--
-- Cada uno decía "único por usuario" y pasa a decir "único por perfil". Sin
-- esto, repetir en el segundo perfil algo que ya existe en el primero devuelve
-- un `duplicate key` que desde la UI parece un bug de la app.
--
-- Van acá, DESPUÉS del backfill: con profile_id nulo en todas las filas, cada
-- índice parcial colisionaría contra sí mismo.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 · "Servicios" tiene que poder existir en dos perfiles.
drop index if exists fin_categories_unique_name;
create unique index fin_categories_unique_name
  on fin_categories (profile_id, kind, name);

-- 2 · La misma persona puede estar en dos perfiles (personas es POR perfil).
drop index if exists fin_people_user_name_idx;
create unique index fin_people_profile_name_idx
  on fin_people (profile_id, lower(name)) where not archived;

-- 3 · Una categoría no puede estar en dos presupuestos activos del MISMO
--     perfil (si no, el total general la contaría dos veces) — pero sí en uno
--     de cada perfil.
--
--     Nota: no hay un único equivalente sobre fin_budget_lines. Su columna
--     `category_id` se borró el 2026-08-23 (multi_categoria) y se llevó su
--     índice con ella; la fuente de verdad es esta tabla puente.
drop index if exists fin_budget_line_categories_category_idx;
create unique index fin_budget_line_categories_category_idx
  on fin_budget_line_categories (profile_id, category_id);

-- 4 · Cerrar el mes en un perfil no puede marcarlo cerrado en los otros.
--
-- El nombre del constraint viejo lo puso Postgres solo (unique inline), así que
-- se busca en el catálogo en vez de adivinarlo: un `drop ... if exists` con el
-- nombre equivocado no falla, no hace nada, y dejaría el unique por usuario
-- vivo — el bug se vería recién al cerrar el mes en el segundo perfil.
do $$
declare
  c text;
begin
  select con.conname into c
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'fin_savings_closures'
    and con.contype = 'u'
    and (select array_agg(att.attname::text order by att.attname::text)
         from unnest(con.conkey) k
         join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k)
        = array['period','user_id'];

  if c is not null then
    execute format('alter table fin_savings_closures drop constraint %I', c);
  end if;
end $$;

alter table fin_savings_closures drop constraint if exists fin_savings_closures_profile_period_key;
alter table fin_savings_closures
  add constraint fin_savings_closures_profile_period_key unique (profile_id, period);

-- 5 · ⚠️ El cajón de sastre. Es lo que garantiza que "nunca queda plata sin
--     asignar" (Sprint 7 §4.3): sin migrarlo, todo perfil salvo el primero se
--     quedaría estructuralmente sin él.
drop index if exists fin_savings_goals_catchall_idx;
create unique index fin_savings_goals_catchall_idx
  on fin_savings_goals (profile_id) where is_catchall and not archived;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5c. Integridad cruzada: FKs compuestas en los cuatro pares que mueven plata
--
-- profile_id está denormalizado en las 17 tablas (§0.1), así que por sí solo
-- nada impide que un movimiento del perfil A salga de una cuenta del perfil B.
-- La técnica estándar de Postgres lo cierra: unique compuesto en el padre, FK
-- compuesta en el hijo.
--
-- Se aplica donde un cruce corrompería un SALDO. En los pares que solo ensucian
-- una lista (líneas de presupuesto, splits de fijos, histórico de pasanaku)
-- alcanza con que la ruta escriba el perfil activo en las dos puntas.
-- ─────────────────────────────────────────────────────────────────────────────

alter table fin_accounts   drop constraint if exists fin_accounts_id_profile;
alter table fin_accounts   add  constraint fin_accounts_id_profile   unique (id, profile_id);
alter table fin_categories drop constraint if exists fin_categories_id_profile;
alter table fin_categories add  constraint fin_categories_id_profile unique (id, profile_id);
alter table fin_people     drop constraint if exists fin_people_id_profile;
alter table fin_people     add  constraint fin_people_id_profile     unique (id, profile_id);

-- 1 · De qué cuenta sale un movimiento. Reemplaza a la FK simple conservando
--     su `on delete restrict` (borrar una cuenta con movimientos ya daba 409).
alter table fin_transactions drop constraint if exists fin_transactions_account_id_fkey;
alter table fin_transactions drop constraint if exists fin_tx_account_same_profile;
alter table fin_transactions add constraint fin_tx_account_same_profile
  foreign key (account_id, profile_id) references fin_accounts (id, profile_id)
  on delete restrict;

-- 2 · A qué cuenta llega una transferencia. Nullable: con to_account_id nulo la
--     FK compuesta no se evalúa (MATCH SIMPLE), que es exactamente lo buscado.
alter table fin_transactions drop constraint if exists fin_transactions_to_account_id_fkey;
alter table fin_transactions drop constraint if exists fin_tx_to_account_same_profile;
alter table fin_transactions add constraint fin_tx_to_account_same_profile
  foreign key (to_account_id, profile_id) references fin_accounts (id, profile_id)
  on delete restrict;

-- 3 · En qué categoría cae. `on delete set null (category_id)` —Postgres 15+—
--     es lo que permite conservar el comportamiento original: borrar una
--     categoría deja el movimiento sin categoría, no lo borra. Un `set null`
--     plano intentaría anular también profile_id, que es NOT NULL, y fallaría.
alter table fin_transactions drop constraint if exists fin_transactions_category_id_fkey;
alter table fin_transactions drop constraint if exists fin_tx_category_same_profile;
alter table fin_transactions add constraint fin_tx_category_same_profile
  foreign key (category_id, profile_id) references fin_categories (id, profile_id)
  on delete set null (category_id);

-- 4 · Quién te debe. Una deuda no puede ser de una persona de otro perfil.
alter table fin_debts drop constraint if exists fin_splits_person_id_fkey;
alter table fin_debts drop constraint if exists fin_debts_person_id_fkey;
alter table fin_debts drop constraint if exists fin_debts_person_same_profile;
alter table fin_debts add constraint fin_debts_person_same_profile
  foreign key (person_id, profile_id) references fin_people (id, profile_id)
  on delete restrict;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS
--
-- Las 17 tablas conservan sus policies `auth.uid() = user_id` sin tocar: la FK
-- compuesta (profile_id, user_id) de arriba ya hace imposible escribir el
-- perfil de otro usuario, así que no hace falta reescribir 68 policies.
--
-- ⚠️ RLS protege ENTRE USUARIOS, no entre perfiles. El perfil activo es un
-- concepto del request, no de la identidad: auth.uid() no sabe en cuál estás.
-- El aislamiento entre tus propios perfiles se aplica en código (§4.2).
-- ─────────────────────────────────────────────────────────────────────────────

alter table fin_profiles enable row level security;

drop policy if exists "fin: ver propios perfiles"        on fin_profiles;
drop policy if exists "fin: crear propios perfiles"      on fin_profiles;
drop policy if exists "fin: actualizar propios perfiles" on fin_profiles;
drop policy if exists "fin: borrar propios perfiles"     on fin_profiles;

create policy "fin: ver propios perfiles" on fin_profiles for select
  using (auth.uid() = user_id);
create policy "fin: crear propios perfiles" on fin_profiles for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propios perfiles" on fin_profiles for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- El default no se borra nunca: la app devuelve 409, y acá queda respaldado
-- para que tampoco se pueda por REST directo.
create policy "fin: borrar propios perfiles" on fin_profiles for delete
  using (auth.uid() = user_id and not is_default);
