-- Finanzas · Sprint 7 (revisión): un fijo puede aportar a un ahorro
--
-- Pedido del usuario (2026-08-24): "un pago fijo para ahorrar cada mes, que no
-- se registre como gasto fijo sino como una transferencia a la cuenta de
-- ahorro". Es "pagarme a mí primero": se aparta el día X del mes, con su
-- pendiente/vencido de siempre, en vez de esperar al cierre y al sobrante.
--
-- Mismo criterio que ya se usó con los compartidos (contexto_finanzas.md §4,
-- "Fijos vs. compartidos"): UN solo módulo de fijos donde esto es un atributo
-- opcional, no un módulo paralelo. Un fijo con `savings_goal_id` genera una
-- transferencia tageada; sin él, sigue generando el gasto de siempre.

alter table fin_recurring
  add column if not exists savings_goal_id uuid references fin_savings_goals(id) on delete restrict,
  add column if not exists to_account_id   uuid references fin_accounts(id) on delete restrict;

-- Las dos columnas van juntas o ninguna: sin cuenta destino no hay
-- transferencia posible, y sin ahorro el aporte no sabría a qué corresponde.
-- Y un fijo de ahorro NO lleva categoría: no es un gasto que presupuestar.
alter table fin_recurring
  drop constraint if exists fin_recurring_savings_shape;
alter table fin_recurring
  add constraint fin_recurring_savings_shape check (
    (savings_goal_id is null and to_account_id is null)
    or
    (savings_goal_id is not null and to_account_id is not null and category_id is null)
  );

create index if not exists fin_recurring_savings_goal_idx
  on fin_recurring (savings_goal_id) where savings_goal_id is not null;

-- `on delete restrict` en las dos FK, mismo criterio que `fin_recurring.
-- account_id` y que la corrección de categorías del 20260824000000: borrar un
-- ahorro o una cuenta que un fijo está usando lo dejaría en un estado que la
-- propia app rechaza (la validación exige las dos columnas juntas), y el fijo
-- quedaría sin poder editarse ni pausarse. Mejor un 409 con un mensaje claro.
