-- Finanzas · tasas automáticas
--
-- Las cotizaciones de mercado NO son datos del usuario: el precio del BTC es el
-- mismo para todos. Van en una tabla global, sin user_id, que escribe solo el
-- refrescador del servidor. Los usuarios la leen; nadie la escribe desde el
-- navegador — por eso tiene policy de select pero NINGUNA de escritura.
-- Es la excepción documentada a la regla de "toda tabla con user_id + RLS".

create table if not exists fin_quotes (
  pair        text primary key check (pair in ('BOB_USD','BOB_USDT','USDT_USD','USDC_USD','BTC_USD')),
  rate        numeric(24,8) not null check (rate > 0),
  source      text not null,
  fetched_at  timestamptz not null default now()
);

alter table fin_quotes enable row level security;

create policy "fin: cualquiera logueado lee cotizaciones" on fin_quotes for select
  using (auth.uid() is not null);
-- Sin policies de insert/update/delete a propósito: solo el service role del
-- refrescador escribe acá. Ni un token robado del cliente puede tocar precios.

-- ── fin_rates: de dónde sale cada tasa ──────────────────────────────────────
-- `auto = true`  → el valor lo pone el refrescador desde `quote_pair`
-- `auto = false` → el usuario lo fijó a mano y el refrescador no lo pisa
alter table fin_rates add column if not exists auto boolean not null default true;
alter table fin_rates add column if not exists quote_pair text;

alter table fin_rates drop constraint if exists fin_rates_quote_pair_check;
alter table fin_rates add constraint fin_rates_quote_pair_check
  check (quote_pair is null or quote_pair in ('BOB_USD','BOB_USDT','USDT_USD','USDC_USD','BTC_USD'));

-- El Bs es el único con dos cotizaciones posibles (oficial y paralela). Arranca
-- en la oficial, que es la que el usuario ya tenía cargada a mano.
update fin_rates set quote_pair = 'BOB_USD'  where currency = 'BOB'  and quote_pair is null;
update fin_rates set quote_pair = 'USDT_USD' where currency = 'USDT' and quote_pair is null;
update fin_rates set quote_pair = 'USDC_USD' where currency = 'USDC' and quote_pair is null;
update fin_rates set quote_pair = 'BTC_USD'  where currency = 'BTC'  and quote_pair is null;
