-- Finanzas · fin_tx_flow_shape también tiene que aceptar gastos e ingresos de
-- cuentas de inversión (Feature 11, §7.1 de contexto_finanzas.md).
--
-- La forma vieja (20260818040000_finanzas_compartidos.sql) solo anticipaba dos
-- casos de `flow_type = 'movimiento'`: una transferencia, o un `ingreso` de
-- reembolso/cobro de deuda — y a este último lo obligaba a no llevar
-- categoría, para no contaminar futuros reportes por categoría.
--
-- Un gasto o ingreso en una cuenta de inversión es un tercer caso que la forma
-- vieja no contemplaba en absoluto: `(type = 'gasto', flow_type =
-- 'movimiento')` no encajaba en NINGUNA de sus tres ramas, así que la base
-- rechazaba el insert entero con un error de constraint. Y un `ingreso` de
-- inversión CON categoría (el usuario sí puede elegir una en el quick-add)
-- tampoco encajaba, por la restricción de categoría nula.
--
-- La regla de "reembolso sin categoría" sigue viva en el código que la
-- necesita (`/debts/settle` siempre graba `category_id: null` él solo — ver
-- app/api/finanzas/debts/settle/route.ts), así que no hace falta que la base
-- seleccione entre "es reembolso" y "es inversión" con una columna que ni
-- siquiera tiene a la vista (`is_investment` vive en `fin_accounts`, no acá).
-- Basta con dejar de exigir la categoría nula a nivel de constraint.
alter table fin_transactions drop constraint if exists fin_tx_flow_shape;
alter table fin_transactions add constraint fin_tx_flow_shape check (
  (type = 'transferencia' and flow_type = 'movimiento')
  or (type in ('gasto', 'ingreso') and flow_type in ('consumo', 'movimiento'))
);
