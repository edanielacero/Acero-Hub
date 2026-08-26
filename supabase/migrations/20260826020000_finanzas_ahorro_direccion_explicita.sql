-- Finanzas · Sprint 7 (revisión 4): la dirección del movimiento de ahorro se
-- declara, no se deduce
--
-- Decisión del usuario (2026-08-26): "no uses la presencia del motivo para
-- definir si es ahorro o no; pregunta explícitamente".
--
-- Tenía razón. La revisión anterior leía `savings_reason is null` como
-- "esto es un aporte", lo cual confunde dos cosas distintas:
--   · "es un aporte"            (una dirección)
--   · "no puse ningún motivo"   (un campo vacío)
-- Un retiro sin motivo cargado —hoy imposible, mañana quizás no— se habría
-- leído como aporte y habría SUMADO al ahorro en vez de restarle. Un dato
-- derivado de la ausencia de otro no se puede auditar: mirando la fila no hay
-- forma de distinguir intención de olvido.
--
-- `savings_flow` lo dice de frente. Se escribe desde una acción explícita del
-- usuario (el botón "gastar de mis ahorros", el selector aporte/retiro de una
-- transferencia) o desde un camino que lo sabe con certeza (el cierre mensual
-- y los fijos de ahorro, que siempre aportan).

alter table fin_transactions
  add column if not exists savings_flow text;

-- Backfill de lo ya escrito: es la mejor información disponible para filas
-- que nacieron bajo la regla vieja, y deja de aplicarse desde acá en adelante.
update fin_transactions
   set savings_flow = case when savings_reason is not null then 'retiro' else 'aporte' end
 where savings_goal_id is not null and savings_flow is null;

-- Va junto con la etiqueta: sin ahorro no hay dirección que declarar, y con
-- ahorro la dirección no puede faltar.
alter table fin_transactions
  drop constraint if exists fin_tx_savings_flow_shape;
alter table fin_transactions
  add constraint fin_tx_savings_flow_shape check (
    (savings_goal_id is null and savings_flow is null)
    or (savings_goal_id is not null and savings_flow in ('aporte', 'retiro'))
  );
