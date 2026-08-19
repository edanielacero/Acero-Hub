-- Finanzas · Cuentas de inversión (Sprint 1, feature 11 del roadmap).
--
-- Una cuenta de inversión (Broker, y las que se sumen después) sube y baja de
-- valor por el mercado, no por plata que ganaste o gastaste de verdad. Antes
-- de esta columna, cualquier ajuste cargado como ingreso/gasto se contaba como
-- consumo real y ensuciaba el gasto/ingreso del mes.
--
-- Ver documentos/finanzas/contexto_finanzas.md §7.1 para el diseño completo.

alter table fin_accounts
  add column is_investment boolean not null default false;
