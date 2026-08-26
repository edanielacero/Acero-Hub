-- Finanzas · Sprint 7 (Ronda 9): el agujero de tres valores, otra vez.
--
-- `20260826070000` abrió `fin_tx_transfer_shape` para el aporte a la misma
-- cuenta así:
--
--   (to_account_id <> account_id or (savings_flow = 'aporte' and to_amount is null))
--
-- Con `savings_flow` en NULL —o sea, en CUALQUIER transferencia común— esa
-- segunda rama evalúa `NULL and true` = NULL, la primera evalúa false para una
-- transferencia a sí misma, y `false OR NULL` es NULL. Un CHECK que da NULL no
-- se viola: volvió a pasar una transferencia de una cuenta a sí misma sin
-- ninguna etiqueta de ahorro, que es exactamente lo que el constraint existe
-- para impedir. Lo cazó `db.mjs` ("rechaza transferencia a la misma cuenta").
--
-- Es la SEGUNDA vez que esta trampa muerde en esta tabla — la primera fue
-- `fin_tx_savings_flow_shape` en `20260826030000`. Regla para la próxima: en
-- un CHECK, comparar una columna nullable con `=` es un bug esperando; va
-- `is not distinct from`, que devuelve false en vez de NULL.

alter table fin_transactions
  drop constraint if exists fin_tx_transfer_shape;
alter table fin_transactions
  add constraint fin_tx_transfer_shape check (
    (type = 'transferencia'
      and to_account_id is not null
      and category_id is null
      and (
        to_account_id <> account_id
        or (savings_flow is not distinct from 'aporte' and to_amount is null)
      ))
    or
    (type in ('gasto','ingreso')
      and to_account_id is null
      and to_amount is null)
  );
