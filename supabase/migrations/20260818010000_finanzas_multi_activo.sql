-- Finanzas · Sprint 1 (ampliación) — USDT, USDC y BTC
--
-- Tres cambios que van juntos:
--   1. El enum de monedas pasa de {USD,BOB} a {USD,BOB,USDT,USDC,BTC}.
--   2. Los montos pasan de numeric(14,2) a numeric(24,8): 0.00042 BTC no entra
--      en dos decimales. `amount_usd` sigue en 2 — el dólar no tiene más.
--   3. La tasa deja de ser una columna suelta y pasa a una tabla con una fila
--      por moneda, porque ahora hay tres tasas que mantener en vez de una.
--
-- La dirección de cada tasa NO es uniforme, y es a propósito: se guarda el
-- número tal como el usuario lo piensa y lo escribe.
--   BOB  → 6.96      "bolivianos por 1 dólar"   ⇒ usd = monto / tasa
--   BTC  → 68000     "dólares por 1 BTC"        ⇒ usd = monto * tasa
--   USDT → 1.00      "dólares por 1 USDT"       ⇒ usd = monto * tasa
-- Guardar 0.1436781609 en vez de 6.96 sería uniforme pero ilegible, y el
-- código que interpreta la dirección son cuatro líneas bien probadas.

-- ── 1. Monedas nuevas ────────────────────────────────────────────────────────
alter table fin_accounts     drop constraint if exists fin_accounts_currency_check;
alter table fin_transactions drop constraint if exists fin_transactions_currency_check;

alter table fin_accounts     add constraint fin_accounts_currency_check
  check (currency in ('USD','BOB','USDT','USDC','BTC'));
alter table fin_transactions add constraint fin_transactions_currency_check
  check (currency in ('USD','BOB','USDT','USDC','BTC'));

-- ── 2. Precisión para satoshis ───────────────────────────────────────────────
alter table fin_accounts     alter column initial_balance type numeric(24,8);
alter table fin_transactions alter column amount          type numeric(24,8);
alter table fin_transactions alter column to_amount       type numeric(24,8);
alter table fin_transactions alter column exchange_rate   type numeric(24,8);

-- ── 3. Una tasa por moneda ───────────────────────────────────────────────────
create table if not exists fin_rates (
  user_id     uuid not null references auth.users(id) on delete cascade,
  currency    text not null check (currency in ('BOB','USDT','USDC','BTC')),
  rate        numeric(24,8) not null check (rate > 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, currency)
);
-- USD no está en el check: es la unidad de referencia, su tasa es siempre 1.

alter table fin_rates enable row level security;

create policy "fin: ver propias tasas" on fin_rates for select
  using (user_id = auth.uid());
create policy "fin: crear propias tasas" on fin_rates for insert
  with check (user_id = auth.uid());
create policy "fin: actualizar propias tasas" on fin_rates for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "fin: borrar propias tasas" on fin_rates for delete
  using (user_id = auth.uid());

-- Se rescata la tasa que el usuario ya tenía cargada antes de tirar la tabla.
insert into fin_rates (user_id, currency, rate, updated_at)
select user_id, 'BOB', usd_bob_rate, updated_at from fin_settings
on conflict (user_id, currency) do nothing;

drop table if exists fin_settings;
