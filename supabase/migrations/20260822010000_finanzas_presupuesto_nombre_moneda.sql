-- Finanzas · Sprint 6 (revisión): nombre propio y moneda de entrada por línea.
--
-- Dos huecos que salieron al probar la UI:
--   1. El título del presupuesto era SIEMPRE el de la categoría (o "Tope
--      general" fijo) — sin forma de ponerle un alias propio.
--   2. El monto solo se podía escribir en USD, aunque el usuario piensa en
--      Bs — el resto de la app (cuentas, movimientos) sí deja elegir moneda.
--
-- `name`            — alias opcional. `null` = usar el nombre de la
--                      categoría (o "Presupuesto general"), que es el
--                      default real, no solo un placeholder.
-- `input_currency`  — en qué moneda se ESCRIBE el monto mensual. Se elige
--                      una sola vez al crear (mismo criterio que
--                      `retroactive`) y de ahí en más los campos de monto de
--                      esa línea se muestran y aceptan en esa moneda. Nunca
--                      se guarda en esa moneda: `amount_usd` sigue siendo la
--                      fuente de verdad, esto es pura comodidad de entrada.

alter table fin_budget_lines
  add column if not exists name text,
  add column if not exists input_currency text not null default 'USD';

alter table fin_budget_lines drop constraint if exists fin_budget_lines_input_currency_check;
alter table fin_budget_lines add constraint fin_budget_lines_input_currency_check
  check (input_currency in ('USD','BOB','USDT','USDC','BTC'));
