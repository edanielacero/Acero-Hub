-- Finanzas · Íconos de línea en vez de emoji
--
-- Ver documentos/finanzas/contexto_ui_finanzas.md §13-19. El emoji rompía el
-- sistema de tintes (trae su propia paleta a color, ignora `color: var(...)`)
-- y no tiene una forma consistente entre plataformas. Se reemplaza por un
-- slug de texto ('comida', 'transporte', ...) que el cliente resuelve a un
-- ícono de línea de @tabler/icons-react, pintado con el color del tinte de la
-- categoría.
--
-- fin_categories y fin_recurring: la columna emoji pasa a llamarse icon.
-- Backfill por nombre — las 14 categorías semilla son las ÚNICAS que existen
-- hoy en la base (verificado con una consulta antes de escribir esta
-- migración), así que el backfill es exacto y no hay ningún emoji elegido a
-- mano que se pueda perder. fin_recurring está vacía todavía (Sprint 3 recién
-- en curso), así que no necesita backfill.
--
-- fin_people: la columna se borra directamente. Una persona ahora se
-- distingue con un círculo + monograma determinístico (mismo hash por nombre
-- que ya usa tintFor() para el color) — no hay nada que elegir ni que
-- guardar, y las tres filas existentes ya tenían `emoji` en null.

alter table fin_categories rename column emoji to icon;
alter table fin_recurring rename column emoji to icon;
alter table fin_people drop column if exists emoji;

update fin_categories set icon = case
  when kind = 'gasto'   and name = 'Comida'         then 'comida'
  when kind = 'gasto'   and name = 'Transporte'     then 'transporte'
  when kind = 'gasto'   and name = 'Vivienda'       then 'vivienda'
  when kind = 'gasto'   and name = 'Servicios'      then 'servicios'
  when kind = 'gasto'   and name = 'Suscripciones'  then 'suscripciones'
  when kind = 'gasto'   and name = 'Salud'          then 'salud'
  when kind = 'gasto'   and name = 'Personal'       then 'personal'
  when kind = 'gasto'   and name = 'Ocio'           then 'ocio'
  when kind = 'gasto'   and name = 'Educación'      then 'educacion'
  when kind = 'gasto'   and name = 'Otros'          then 'otros'
  when kind = 'ingreso' and name = 'Sueldo'         then 'sueldo'
  when kind = 'ingreso' and name = 'Freelance'      then 'freelance'
  when kind = 'ingreso' and name = 'Extraordinario' then 'extraordinario'
  when kind = 'ingreso' and name = 'Otros'          then 'otros-ingreso'
  else icon
end;
