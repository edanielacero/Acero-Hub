-- Finanzas · Sprint 5 (corrección): la cuenta de un pasanaku se elige al
-- APORTAR o RECIBIR, no al crearlo — mismo patrón que ya tiene fin_recurring
-- desde 20260820000000_finanzas_fijos_moneda_cuenta_opcional.sql.
--
-- Feedback del usuario tras probarlo: igual que un fijo, un pasanaku es "un
-- monto en una moneda" — de dónde sale cada aporte y a dónde entra la
-- recepción se decide movimiento por movimiento, no de una vez al crearlo.
--
-- Lo que SÍ necesita el pasanaku es una moneda propia: sin ella no hay
-- decimales (BTC usa 8, el resto 2) ni label que mostrar en "Aporte por mes"
-- mientras todavía no hay cuenta elegida. Se guarda aparte, independiente de
-- la cuenta — igual que fin_recurring.currency.

alter table fin_pasanaku add column if not exists currency text not null default 'USD'
  check (currency in ('USD','BOB','USDT','USDC','BTC'));

-- Backfill: los pasanaku que ya tenían cuenta (no debería haber ninguno en
-- producción todavía) usan la moneda de esa cuenta, no el default 'USD'.
update fin_pasanaku p set currency = a.currency
from fin_accounts a where a.id = p.account_id;

alter table fin_pasanaku alter column account_id drop not null;
