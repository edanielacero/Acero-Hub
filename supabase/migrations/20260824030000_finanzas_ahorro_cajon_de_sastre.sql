-- Finanzas · Sprint 7 (revisión): el ahorro que absorbe el sobrante
--
-- Decisión del usuario (2026-08-24): "no quiero que haya un sin asignar,
-- quiero que el restante quede como ahorro". Uno de los ahorros se marca como
-- el que recibe todo lo que el reparto no asignó — así cada mes se reparte el
-- 100% del sobrante y "sin asignar" deja de existir en la práctica.
--
-- Índice único PARCIAL: como mucho un cajón de sastre activo por usuario. Se
-- ignoran los archivados, mismo criterio que fin_budget_lines con sus
-- categorías — archivar uno tiene que dejar libre el lugar para otro.

alter table fin_savings_goals
  add column if not exists is_catchall boolean not null default false;

create unique index if not exists fin_savings_goals_catchall_idx
  on fin_savings_goals (user_id)
  where is_catchall and not archived;
