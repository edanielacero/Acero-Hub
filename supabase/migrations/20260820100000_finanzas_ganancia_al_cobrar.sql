-- Finanzas: la ganancia de un compartido se reconoce al COBRAR, no al crear
-- el gasto.
--
-- Hasta ahora, repartir por encima de lo que pagaste ("le cobro $8 a Ana por
-- algo que me costó $6") ya reducía el gasto real del mes al REGISTRAR el
-- fijo/gasto — antes de que nadie te haya pagado un centavo. Eso es contar la
-- ganancia dos veces si además se reconoce al cobrar.
--
-- `principal_usd` congela, por deuda, cuánto de esa deuda es recuperar costo
-- real (en USD, igual que `amount_usd`). La ganancia nunca se guarda aparte:
-- es siempre `amount_usd - principal_usd`. Casi siempre son iguales — solo
-- difieren cuando el reparto de un gasto compartido supera lo que pagaste.

alter table fin_debts add column if not exists principal_usd numeric(24,8);

-- Backfill conservador: lo ya existente queda como "100% recuperación", sin
-- inventar ganancia retroactiva sobre deudas ya creadas bajo el criterio
-- anterior (ese margen, si lo hubo, ya se contó una vez en su momento).
update fin_debts set principal_usd = amount_usd where principal_usd is null;

alter table fin_debts alter column principal_usd set not null;

alter table fin_debts add constraint fin_debts_principal_shape
  check (principal_usd >= 0 and principal_usd <= amount_usd);
