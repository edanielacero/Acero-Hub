-- Se descontinúa la mini-app Acero IA: se borran sus tablas, su registro en
-- projects y cualquier acceso otorgado (no había ninguno).

drop table if exists public.aia_usage_logs cascade;
drop table if exists public.aia_alerts cascade;
drop table if exists public.aia_usage_limits cascade;
drop table if exists public.aia_images cascade;
drop table if exists public.aia_messages cascade;
drop table if exists public.aia_conversations cascade;
drop table if exists public.aia_presets cascade;

delete from public.project_access
where project_id = (select id from public.projects where slug = 'acero-ia');

delete from public.projects where slug = 'acero-ia';
