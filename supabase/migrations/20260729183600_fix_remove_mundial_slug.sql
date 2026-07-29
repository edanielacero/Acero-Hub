-- La migración 20260720000000_remove_mundial.sql borró las tablas mundial_*
-- pero el DELETE de projects apuntaba al slug equivocado ('mundial-2026' en
-- vez de 'mundial'), así que la fila de projects (y su project_access) nunca
-- se borraron. Se completa acá con el slug correcto.

delete from public.project_access
where project_id = (select id from public.projects where slug = 'mundial');

delete from public.projects where slug = 'mundial';
