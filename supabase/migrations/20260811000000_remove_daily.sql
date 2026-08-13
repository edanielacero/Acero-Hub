-- Se descontinúa la mini-app Daily. No tenía tablas propias (guardaba todo en
-- localStorage del navegador); project_access se elimina por CASCADE desde projects.

DELETE FROM public.projects WHERE slug = 'daily';
