-- Finanzas · Sprint 7 (Ronda 9): a qué mes pertenece cada aporte.
--
-- El reparto de fin de mes dejó de ser un acto global ("repartir el mes") y
-- pasó a ser uno por plan: cada ahorro tiene su propio botón "Ahorrar". Eso
-- necesita saber, por ahorro y por mes, si ya se guardó algo — y la fecha del
-- movimiento no alcanza para decirlo: el aporte del reparto de julio se
-- registra en agosto, cuando julio ya terminó.
--
-- `savings_period` lo dice de frente, con el primero del mes al que
-- corresponde. Lo escriben los dos caminos que aportan:
--   · el reparto de fin de mes  → el mes que se está organizando
--   · un fijo de ahorro         → el mes en que cae su fecha
--
-- Con eso salen las dos cosas que se pidieron: esconder el botón "Ahorrar" de
-- un plan cuando ese mes ya se guardó, y la tabla de meses del detalle con
-- un check o un guion por mes.

alter table fin_transactions
  add column if not exists savings_period date;

-- Solo tiene sentido en un aporte, y siempre es el primero del mes.
alter table fin_transactions
  drop constraint if exists fin_tx_savings_period_shape;
alter table fin_transactions
  add constraint fin_tx_savings_period_shape check (
    savings_period is null
    or (savings_flow = 'aporte' and extract(day from savings_period) = 1)
  );

-- Backfill: los aportes que ya existen pertenecen al mes de su fecha. Es la
-- mejor información disponible y deja de aplicarse desde acá en adelante.
update fin_transactions
   set savings_period = date_trunc('month', date)::date
 where savings_flow = 'aporte' and savings_period is null;

create index if not exists fin_tx_savings_period_idx
  on fin_transactions (user_id, savings_goal_id, savings_period)
  where savings_period is not null;
