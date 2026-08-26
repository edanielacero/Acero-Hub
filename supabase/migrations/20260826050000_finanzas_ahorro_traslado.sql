-- Finanzas · Sprint 7 (Ronda 8): mover un ahorro de una cuenta a otra.
--
-- Faltaba una tercera dirección. Con solo `aporte` y `retiro`, mover plata YA
-- ahorrada entre dos cuentas propias no tenía forma de expresarse:
--   · marcarlo como aporte la contaba dos veces (quedaba apartada en el
--     origen Y en el destino, y el saldo del ahorro subía sin que entrara un
--     peso nuevo),
--   · marcarlo como retiro la sacaba del ahorro, que es lo contrario de lo
--     que pasó.
-- Estaba anotado como límite conocido en §4.9 del sprint; el usuario pidió
-- cerrarlo, y en el lugar correcto: la pantalla de Ahorros.
--
-- Un `traslado` mueve los DOS lados de lo apartado (sale de una cuenta, entra
-- en la otra) y deja el saldo del ahorro intacto.

alter table fin_transactions
  drop constraint if exists fin_tx_savings_flow_shape;
alter table fin_transactions
  add constraint fin_tx_savings_flow_shape check (
    (savings_goal_id is null and savings_flow is null)
    or (savings_goal_id is not null
        and savings_flow is not null
        and savings_flow in ('aporte', 'retiro', 'traslado'))
  );
