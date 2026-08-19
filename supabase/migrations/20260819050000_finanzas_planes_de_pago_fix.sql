-- Finanzas · corrige fin_debt_plan_shape
--
-- `fin_debts.plan_id` tiene `on delete set null`: al borrar un plan, la base
-- anula `plan_id` sola, pero NO toca `plan_installment_no` — esa columna no es
-- parte de la FK. El constraint original exigía que los dos fueran null juntos,
-- así que el propio `on delete set null` habría dejado la fila violando su
-- constraint, y el borrado del plan habría fallado en seco.
--
-- La regla que de verdad importa es más chica: si hay número de cuota, que sea
-- positivo. Que quede un `plan_installment_no` colgando después de borrar el
-- plan es inofensivo — es la misma tolerancia que el resto de la app le da a
-- los punteros huérfanos (p. ej. `fin_transactions.recurring_id`).

alter table fin_debts drop constraint if exists fin_debt_plan_shape;
alter table fin_debts add constraint fin_debt_plan_shape check (
  plan_installment_no is null or plan_installment_no > 0
);
