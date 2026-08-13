-- Custom Access Token Hook: agrega profiles.role al JWT como
-- claims.app_metadata.role, para no tener que consultar `profiles` en cada
-- chequeo de rol (layouts de cada mini-app) una vez que Supabase Auth invoque
-- este hook. Se registra manualmente en Dashboard → Authentication → Hooks →
-- Custom Access Token (no scripteable por CLI) — esta migración solo crea la
-- función para que exista cuando se la vaya a seleccionar ahí.
--
-- IMPORTANTE: el claim se guarda bajo `app_metadata`, NUNCA como `role` de
-- primer nivel — ese nombre ya lo usa Supabase para el rol de Postgres
-- (`authenticated`/`anon`) que decide con qué permisos corre la conexión;
-- pisarlo rompería RLS para todo el proyecto.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  claims    jsonb;
  app_meta  jsonb;
  user_role text;
begin
  select role into user_role from public.profiles where id = (event->>'user_id')::uuid;

  claims   := event->'claims';
  app_meta := coalesce(claims->'app_metadata', '{}'::jsonb);
  app_meta := jsonb_set(app_meta, '{role}', to_jsonb(coalesce(user_role, 'user')));
  claims   := jsonb_set(claims, '{app_metadata}', app_meta);

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- Patrón oficial de Supabase para este hook: GoTrue lo invoca autenticado
-- como supabase_auth_admin, así que ese rol necesita permiso explícito para
-- ejecutar la función y leer profiles (sin esto, el hook falla en cada login).
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

grant select on public.profiles to supabase_auth_admin;

drop policy if exists "hook: leer profiles para custom claims" on public.profiles;
create policy "hook: leer profiles para custom claims" on public.profiles
  as permissive for select
  to supabase_auth_admin
  using (true);
