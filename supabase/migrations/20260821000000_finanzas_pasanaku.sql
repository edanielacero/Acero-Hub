-- Finanzas · Sprint 5: "Pasanaku"
--
-- Spec: documentos/finanzas/sprint_5_pasanaku.md
--
-- Alcance recortado a último momento (2026-08-21): NO se modela el grupo
-- completo (participantes, rondas ajenas, turnos de otros). Es un tracker
-- personal de un solo lado — el mío: cuánto aporto, cuántos puestos somos,
-- qué puesto me toca a mí, y cuándo recibo. La fecha de mi turno se DERIVA
-- de `start_date` + `my_slot`, igual que el saldo de una cuenta se deriva de
-- sus movimientos — no se guarda.
--
-- El aporte es un `gasto · movimiento` (no `consumo`): la plata sale de una
-- cuenta pero vuelve completa cuando toca el turno, así que no puede ensuciar
-- "cuánto gasté este mes" (§3.1 de contexto_finanzas.md). La recepción es un
-- `ingreso · movimiento` por la misma razón inversa. El constraint que en su
-- momento bloqueaba justo esta combinación (`fin_tx_flow_shape`) ya no lo
-- hace: se relajó como efecto colateral de la Feature 11 (Cuentas de
-- inversión, `20260819070000_finanzas_flow_shape_inversion.sql`), así que
-- este sprint no necesita tocarlo.

create table if not exists fin_pasanaku (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,

  name                 text not null default 'Pasanaku',

  -- De qué cuenta sale cada aporte y a qué cuenta entra la recepción. Restrict
  -- porque borrar la cuenta dejaría el pasanaku sin poder registrar nada —
  -- mismo criterio que fin_recurring.account_id.
  account_id           uuid not null references fin_accounts(id) on delete restrict,

  -- Default editable al registrar cada aporte, no una ley — mismo trato que
  -- fin_recurring.amount.
  contribution_amount  numeric(24,8) not null check (contribution_amount > 0),

  -- Cuántos puestos tiene la ronda y cuál es el mío. De acá se deriva cuándo
  -- me toca recibir: start_date + (my_slot - 1) meses.
  total_slots          integer not null check (total_slots > 1),
  my_slot              integer not null check (my_slot >= 1),

  start_date           date not null,

  archived             boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint fin_pasanaku_slot_shape check (my_slot <= total_slots)
);

create index if not exists fin_pasanaku_user_idx on fin_pasanaku (user_id, archived);

-- ─── El vínculo de vuelta ───────────────────────────────────────────────────
--
-- Cada aporte y la recepción son filas normales de fin_transactions con este
-- puntero. "¿Ya recibí mi turno?" NO se guarda como flag: se deriva de que
-- exista un ingreso con este pasanaku_id — mismo principio que el estado de
-- los fijos (Sprint 3) y de las deudas (Sprint 2). set null: borrar el
-- pasanaku no borra la historia de lo que aportaste.
alter table fin_transactions
  add column if not exists pasanaku_id uuid references fin_pasanaku(id) on delete set null;

create index if not exists fin_transactions_pasanaku_idx
  on fin_transactions (user_id, pasanaku_id, date);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table fin_pasanaku enable row level security;

drop policy if exists "fin: ver propio pasanaku"        on fin_pasanaku;
drop policy if exists "fin: crear propio pasanaku"      on fin_pasanaku;
drop policy if exists "fin: actualizar propio pasanaku" on fin_pasanaku;
drop policy if exists "fin: borrar propio pasanaku"     on fin_pasanaku;

create policy "fin: ver propio pasanaku" on fin_pasanaku for select
  using (auth.uid() = user_id);
create policy "fin: crear propio pasanaku" on fin_pasanaku for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propio pasanaku" on fin_pasanaku for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propio pasanaku" on fin_pasanaku for delete
  using (auth.uid() = user_id);
