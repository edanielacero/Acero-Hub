-- Finanzas · Presupuesto: el monto que el usuario escribió deja de ser
-- derivado.
--
-- Hasta ahora `fin_budget_periods` guardaba SOLO `amount_usd`, y el monto en
-- la moneda de la línea se reconstruía en cada lectura con la tasa del
-- momento. Con la tasa del Bs en automático (flota con el paralelo), un
-- presupuesto cargado como "2.400 Bs" se veía después como "2.400,02 Bs":
-- el número que el usuario tipeó no era el que la app guardaba.
--
-- Mismo criterio que `fin_transactions` (Sprint 1 §2): se guarda el monto
-- nativo, y la tasa se CONGELA al escribir. `amount_usd` sigue existiendo
-- —es lo que permite comparar y sumar categorías de distintas monedas— pero
-- pasa a ser el derivado, no la fuente. La otra moneda es solo referencia.

alter table fin_budget_periods
  add column if not exists amount numeric(24,8),
  add column if not exists exchange_rate numeric(24,8);

-- Backfill de las filas que ya existen: su monto nativo es el amount_usd
-- convertido con la tasa vigente de la línea. No es exacto al centavo para
-- las que se cargaron con otra tasa, pero es lo más cercano posible — y de
-- acá en adelante ya no se vuelve a mover.
update fin_budget_periods p
set
  -- `exchange_rate` sigue la convención de toda la app (ver `freezeRate`):
  -- USD por 1 unidad nativa, de modo que amount_usd = amount × exchange_rate.
  -- Para el Bs, `fin_rates.rate` está guardada al revés (Bs por USD), así que
  -- se invierte; para el BTC ya viene directa.
  exchange_rate = case
    when l.input_currency = 'USD' then 1
    when l.input_currency in ('BOB') then 1 / nullif((select r.rate from fin_rates r
                   where r.user_id = p.user_id and r.currency = l.input_currency), 0)
    else coalesce((select r.rate from fin_rates r
                   where r.user_id = p.user_id and r.currency = l.input_currency), 1)
  end,
  amount = case
    when l.input_currency = 'USD' then p.amount_usd
    when l.input_currency in ('BOB') then p.amount_usd * coalesce((select r.rate from fin_rates r
                                  where r.user_id = p.user_id and r.currency = l.input_currency), 1)
    else p.amount_usd / nullif(coalesce((select r.rate from fin_rates r
                                  where r.user_id = p.user_id and r.currency = l.input_currency), 1), 0)
  end
from fin_budget_lines l
where l.id = p.line_id and p.amount is null;

-- Ya sin filas vacías, pasan a obligatorias: toda fila nueva llega con su
-- monto nativo y su tasa congelada.
alter table fin_budget_periods alter column amount set not null;
alter table fin_budget_periods alter column exchange_rate set not null;

alter table fin_budget_periods drop constraint if exists fin_budget_periods_amount_check;
alter table fin_budget_periods add constraint fin_budget_periods_amount_check check (amount > 0);
alter table fin_budget_periods drop constraint if exists fin_budget_periods_exchange_rate_check;
alter table fin_budget_periods add constraint fin_budget_periods_exchange_rate_check check (exchange_rate > 0);

-- Lo mismo para las ampliaciones: se escriben en la moneda de la línea y
-- se suman al monto nativo, así que necesitan el mismo tratamiento.
alter table fin_budget_extensions
  add column if not exists amount numeric(24,8),
  add column if not exists exchange_rate numeric(24,8);

-- Se hereda la tasa ya congelada del período al que cuelga: una ampliación
-- pertenece a ese mes, no a una tasa propia.
update fin_budget_extensions e
set
  exchange_rate = p.exchange_rate,
  amount = e.amount_usd / nullif(p.exchange_rate, 0)
from fin_budget_periods p
where p.id = e.period_id and e.amount is null;

alter table fin_budget_extensions alter column amount set not null;
alter table fin_budget_extensions alter column exchange_rate set not null;

alter table fin_budget_extensions drop constraint if exists fin_budget_extensions_amount_check;
alter table fin_budget_extensions add constraint fin_budget_extensions_amount_check check (amount > 0);
alter table fin_budget_extensions drop constraint if exists fin_budget_extensions_exchange_rate_check;
alter table fin_budget_extensions add constraint fin_budget_extensions_exchange_rate_check check (exchange_rate > 0);

-- Y para los cierres: el disponible que se congela al cerrar un mes también
-- se muestra en la moneda de la línea. Acá SIN check > 0: un mes en rojo
-- cierra con disponible negativo (ver la migración del Sprint 6).
alter table fin_budget_closures
  add column if not exists amount numeric(24,8),
  add column if not exists exchange_rate numeric(24,8);

-- Misma tasa que el período de ESE mes de la línea (o 1 si no quedó ninguno).
-- Con subconsulta y no con JOIN en el FROM: un `left join` ahí no puede
-- referenciar a `c`, que es justo lo que hace falta para casar el período.
update fin_budget_closures c
set
  exchange_rate = coalesce(
    (select p.exchange_rate from fin_budget_periods p
     where p.line_id = c.line_id and p.period = c.period), 1),
  amount = c.amount_usd / nullif(coalesce(
    (select p.exchange_rate from fin_budget_periods p
     where p.line_id = c.line_id and p.period = c.period), 1), 0)
where c.amount is null;

alter table fin_budget_closures alter column amount set not null;
alter table fin_budget_closures alter column exchange_rate set not null;

alter table fin_budget_closures drop constraint if exists fin_budget_closures_exchange_rate_check;
alter table fin_budget_closures add constraint fin_budget_closures_exchange_rate_check check (exchange_rate > 0);
