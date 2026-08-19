-- Finanzas · desde cuándo corre un gasto fijo
--
-- Al crear un fijo no siempre querés empezar hoy: puede que el servicio arranque
-- el mes que viene, o que lo estés cargando tarde y quieras registrar los meses
-- que ya pasaron.
--
-- Sin esta columna, un fijo siempre nacía "vencido desde este mes" y no había
-- forma de decirle que empieza después, ni de recuperar los meses anteriores.

alter table fin_recurring
  add column if not exists starts_on date not null default current_date;

-- Los que ya existen arrancaron cuando se crearon.
update fin_recurring set starts_on = created_at::date where starts_on = current_date;

comment on column fin_recurring.starts_on is
  'Primer período que cuenta. Anterior a hoy = hay meses para recuperar; posterior = todavía no arrancó.';
