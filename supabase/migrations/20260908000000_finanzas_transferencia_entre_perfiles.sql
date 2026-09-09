-- Transferencia entre perfiles.
--
-- Hoy un movimiento no puede cruzar perfiles: `fin_tx_account_same_profile` y
-- `fin_tx_to_account_same_profile` (20260827000000) obligan a que account_id
-- y to_account_id vivan en el MISMO profile_id que la fila. Es una protección
-- deliberada — un cruce corrompería un saldo — y no se toca.
--
-- En vez de forzar ese FK, una transferencia entre perfiles se modela como
-- DOS filas vinculadas, una por perfil: la que sale (transferencia,
-- to_account_id null) y la que entra (ingreso, flow_type movimiento — mismo
-- mecanismo que ya usa cualquier "esto sube el saldo pero no es plata que
-- ganaste", ver ingresoUsd en lib/finanzas/transactions.ts). Cada una vive
-- enteramente dentro de su propio perfil, así que ningún FK existente se ve
-- afectado.

alter table fin_transactions
  add column if not exists linked_tx_id uuid references fin_transactions(id) on delete restrict,
  add column if not exists linked_profile_id uuid references fin_profiles(id) on delete restrict;

-- `on delete restrict` en linked_tx_id es a propósito: borrar una sola pata
-- con SQL suelto falla, porque la otra todavía la referencia. Las dos solo se
-- pueden borrar juntas en un mismo `delete ... where id in (a, b)` — Postgres
-- chequea los FKs al final del statement, así que las dos desaparecen a la
-- vez sin violar nada. Eso fuerza a pasar siempre por la ruta de la API, que
-- es la que borra el par completo (nunca deja una pata huérfana).

create index if not exists fin_transactions_linked_tx_idx
  on fin_transactions (linked_tx_id) where linked_tx_id is not null;
