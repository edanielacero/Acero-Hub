-- Se descarta la primera versión de la mini-app Finanzas para rehacerla desde cero.
-- Se borran sus 7 tablas, su registro en projects y cualquier acceso otorgado.
-- No había datos reales: 0 cuentas, 0 transacciones, 0 tasas; solo 73 categorías
-- semilla y 1 perfil por defecto, todo regenerable.
--
-- El diseño "liquid glass" del tab bar se conservó aparte, en
-- documentos/design/liquid-glass-menu.md — es lo único que se reutiliza.

drop table if exists public.fin_transactions cascade;
drop table if exists public.fin_asset_valuations cascade;
drop table if exists public.fin_category_rules cascade;
drop table if exists public.fin_categories cascade;
drop table if exists public.fin_exchange_rates cascade;
drop table if exists public.fin_accounts cascade;
drop table if exists public.fin_profiles cascade;

delete from public.project_access
where project_id = (select id from public.projects where slug = 'finanzas');

delete from public.projects where slug = 'finanzas';
