-- Finanzas · Sprint 7 (revisión 2): ajustes pedidos por el usuario (2026-08-26)
--
-- 1. El cajón de sastre NO tiene reparto propio.
--    `proposeAllocation` lo excluye del reparto normal y le da lo que sobra,
--    así que su `allocation_type`/`allocation_value` nunca se leían — pero el
--    formulario los exigía igual. Pedir un número que nadie usa, y que el
--    usuario no puede saber ("¿cuánto va a sobrar?"), no tiene sentido.
--    Pasan a ser nulos, obligatorios solo para los ahorros que sí reparten.
--
-- 2. La cuenta destino de un fijo de ahorro se elige al REGISTRAR, no al
--    crear la plantilla. Es el mismo criterio que ya rige para
--    `fin_recurring.account_id` ("la cuenta se elige recién al registrar cada
--    instancia; la plantilla solo necesita saber en qué moneda está el
--    monto"). Hacerla obligatoria al crear rompía esa simetría sin motivo.

-- ─── 1. Reparto opcional para el cajón de sastre ────────────────────────────

alter table fin_savings_goals alter column allocation_type  drop not null;
alter table fin_savings_goals alter column allocation_value drop not null;

alter table fin_savings_goals drop constraint if exists fin_savings_goal_percent_range;
alter table fin_savings_goals drop constraint if exists fin_savings_goals_allocation_value_check;
alter table fin_savings_goals drop constraint if exists fin_savings_goals_allocation_type_check;

-- Los dos campos van juntos o ninguno, y solo pueden faltar en el cajón de
-- sastre — que se lleva el remanente y no necesita una regla propia.
alter table fin_savings_goals
  add constraint fin_savings_goal_allocation_shape check (
    (allocation_type is null and allocation_value is null and is_catchall)
    or (
      allocation_type in ('fixed', 'percent')
      and allocation_value > 0
      and (allocation_type = 'fixed' or allocation_value <= 100)
    )
  );

-- ─── 2. Cuenta destino opcional en la plantilla del fijo ────────────────────

alter table fin_recurring drop constraint if exists fin_recurring_savings_shape;
alter table fin_recurring
  add constraint fin_recurring_savings_shape check (
    (savings_goal_id is null and to_account_id is null)
    or (savings_goal_id is not null and category_id is null)
  );
