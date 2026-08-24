-- Finanzas · Transferencias: congelar también el lado que LLEGA.
--
-- Una transferencia entre monedas distintas guardaba `to_amount` (lo que
-- realmente entró, en la moneda destino) pero no su equivalente en USD. Con
-- solo `amount_usd` congelado del lado que sale, la comisión —la diferencia
-- entre lo que salió y lo que llegó— había que calcularla convirtiendo
-- `to_amount` con la tasa de HOY. Eso la hace moverse sola: la misma
-- transferencia mostraría una comisión distinta cada vez que el paralelo se
-- corre, y hasta podría dar negativa.
--
-- Mismo criterio que el resto de la app (§4.1 de contexto_finanzas.md, y las
-- migraciones de presupuesto): lo que pasó, pasó a la tasa de ese día.
--
-- Nulos a propósito: una transferencia de misma moneda no tiene `to_amount`
-- (lo rechaza `validateInput`), y un gasto o ingreso tampoco.

alter table fin_transactions
  add column if not exists to_amount_usd numeric(14,2),
  add column if not exists to_exchange_rate numeric(24,8);

-- Backfill de las que ya existen: no hay forma de recuperar la tasa del día
-- en que se hicieron, así que se usa la vigente. Es aproximado y solo para
-- las filas viejas — de acá en adelante se congela al escribir.
update fin_transactions t
set
  to_exchange_rate = case
    when a.currency = 'USD' then 1
    when a.currency = 'BOB' then 1 / nullif((select r.rate from fin_rates r
                   where r.user_id = t.user_id and r.currency = a.currency), 0)
    else coalesce((select r.rate from fin_rates r
                   where r.user_id = t.user_id and r.currency = a.currency), 1)
  end,
  to_amount_usd = round(
    t.to_amount * case
      when a.currency = 'USD' then 1
      when a.currency = 'BOB' then 1 / nullif((select r.rate from fin_rates r
                     where r.user_id = t.user_id and r.currency = a.currency), 0)
      else coalesce((select r.rate from fin_rates r
                     where r.user_id = t.user_id and r.currency = a.currency), 1)
    end, 2)
from fin_accounts a
where a.id = t.to_account_id
  and t.to_amount is not null
  and t.to_amount_usd is null;

-- Sin NOT NULL: la enorme mayoría de las filas (gastos, ingresos y
-- transferencias de misma moneda) no tienen destino que congelar.
alter table fin_transactions drop constraint if exists fin_tx_to_rate_check;
alter table fin_transactions add constraint fin_tx_to_rate_check
  check (to_exchange_rate is null or to_exchange_rate > 0);
