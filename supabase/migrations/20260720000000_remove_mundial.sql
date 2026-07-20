-- Eliminar proyecto Mundial 2026 del hub y sus tablas de datos.
-- project_access se elimina por CASCADE desde projects.

DELETE FROM public.projects WHERE slug = 'mundial-2026';

DROP TABLE IF EXISTS public.mundial_bets     CASCADE;
DROP TABLE IF EXISTS public.mundial_matches  CASCADE;
DROP TABLE IF EXISTS public.mundial_profiles CASCADE;
DROP TABLE IF EXISTS public.mundial_settings CASCADE;
