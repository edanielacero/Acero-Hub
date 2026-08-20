-- Finanzas: la cuenta de un fijo se elige al REGISTRARLO, no al crearlo.
--
-- Antes, `account_id` era obligatorio desde el alta y de ahí salía la moneda
-- del campo Monto. En la práctica, muchas veces no sabés todavía con qué
-- cuenta vas a cubrir un fijo nuevo — el endpoint de registro
-- (app/api/finanzas/recurring/[id]/register/route.ts) ya acepta un
-- `account_id` propio de la instancia, así que la plantilla no necesita el
-- suyo para funcionar.
--
-- Lo que SÍ necesita la plantilla es una moneda: sin ella no hay decimales
-- (BTC usa 8, el resto 2) ni label que mostrar en el campo Monto mientras
-- todavía no hay cuenta elegida. Se guarda aparte, independiente de la cuenta.

alter table fin_recurring add column if not exists currency text not null default 'USD'
  check (currency in ('USD','BOB','USDT','USDC','BTC'));

-- Backfill: los fijos existentes ya tenían cuenta — su moneda es la de esa
-- cuenta, no el default 'USD' recién puesto.
update fin_recurring r set currency = a.currency
from fin_accounts a where a.id = r.account_id;

alter table fin_recurring alter column account_id drop not null;
