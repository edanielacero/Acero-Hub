-- Finanzas · Sprint 7 (revisión 3): cualquier cuenta puede alojar ahorros
--
-- Decisión del usuario (2026-08-26): "todas las cuentas deberían poder ser
-- para ahorro, ya no necesito un selector de decir cuáles cuentas serán para
-- ahorro".
--
-- Es la consecuencia lógica de que el ahorro sea una ETIQUETA sobre el
-- movimiento y no una propiedad de la cuenta: si lo que convierte plata en
-- ahorro es `fin_transactions.savings_goal_id`, marcar la cuenta no aporta
-- nada — y sí estorbaba, porque obligaba a declarar de antemano dónde iban a
-- vivir los ahorros.
--
-- La columna se va del todo en vez de quedar muerta: una columna que ya no
-- decide nada pero sigue ahí es una invitación a que alguien vuelva a
-- basarse en ella.
--
-- ⚠️ Qué la reemplaza para saber la DIRECCIÓN de una transferencia
-- etiquetada: `savings_reason`. Con motivo es un retiro (sale del ahorro),
-- sin motivo es un aporte (entra). Ya estaba en el esquema y es exactamente
-- lo que significa — antes se deducía de `is_savings`, que era una señal
-- prestada.

alter table fin_accounts drop constraint if exists fin_accounts_savings_investment_excl;
alter table fin_accounts drop column if exists is_savings;
