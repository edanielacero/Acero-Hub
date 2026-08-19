-- Finanzas · planes de pago sobre una deuda
--
-- El usuario decide en cuántas cuotas cobra una deuda, con o sin interés, y
-- puede editar cada cuota después. La pregunta abierta #1 del contexto (¿la
-- última cuota de los $957 es de $57 o son 10 de $100?) deja de bloquear
-- nada: el usuario arma el plan que se haya acordado, y lo corrige cuando el
-- deudor confirme. Ver documentos/finanzas/sprint_4_planes_de_pago.md.

create table fin_debt_plans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  person_id      uuid not null references fin_people(id) on delete restrict,
  concept        text not null,
  principal      numeric(24,8) not null check (principal > 0),
  currency       text not null check (currency in ('USD','BOB','USDT','USDC','BTC')),
  -- `null` significa "solo capital": es la respuesta directa a "debo poder
  -- cobrar con intereses si quiero o solo el monto del capital de la deuda".
  interest_rate  numeric(7,3) check (interest_rate is null or interest_rate >= 0),
  installments   integer not null check (installments > 0),
  frequency      text not null default 'mensual'
                 check (frequency in ('semanal','quincenal','mensual')),
  starts_on      date not null,
  note           text,
  created_at     timestamptz not null default now()
);

create index on fin_debt_plans (user_id, person_id);

-- Cada cuota generada es una fila normal de fin_debts: cobrar, condonar y
-- deshacer siguen funcionando sin ningún cambio en esos endpoints.
alter table fin_debts
  add column if not exists plan_id uuid references fin_debt_plans(id) on delete set null,
  add column if not exists plan_installment_no integer;

-- `on delete set null`, no `cascade` ni `restrict`: borrar el plan no borra la
-- historia de lo que ya se cobró o condonó (mismo criterio que
-- fin_transactions.recurring_id en el Sprint 3). El caso en que sí hace falta
-- borrar cuotas -todas pendientes- lo maneja la API, no la base.
alter table fin_debts add constraint fin_debt_plan_shape check (
  (plan_id is null and plan_installment_no is null)
  or (plan_id is not null and plan_installment_no > 0)
);

create index on fin_debts (plan_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────
alter table fin_debt_plans enable row level security;

create policy "fin: ver propios planes" on fin_debt_plans for select
  using (auth.uid() = user_id);
create policy "fin: crear propios planes" on fin_debt_plans for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propios planes" on fin_debt_plans for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propios planes" on fin_debt_plans for delete
  using (auth.uid() = user_id);
