-- Extiende el custom access token hook para que el JWT también cargue QUÉ
-- mini-apps puede ver el usuario (`app_metadata.projects`, lista de slugs) y su
-- nombre, además del rol que ya traía.
--
-- Contexto: los layouts de cada mini-app resolvían el acceso consultando
-- `profiles` + `projects` + `project_access` en cada request. Eso obliga a que
-- la ruta sea dinámica, y por lo tanto a un viaje al servidor en CADA
-- navegación. Con los slugs firmados dentro del token, el proxy decide el
-- acceso sin tocar la base y las rutas pueden ser estáticas — que es lo que
-- hace que navegar se sienta instantáneo.
--
-- SEGURIDAD: esto es un gate de NAVEGACIÓN, no la defensa de los datos. El
-- claim se congela hasta que el token se refresca (~1h), así que un acceso
-- revocado puede seguir abriendo el cascarón de la mini-app un rato. No hay
-- fuga de datos: las rutas de /api siguen validando en el servidor con
-- requireUser() y las policies de RLS siguen filtrando por dueño.
--
-- Igual que antes, el claim va bajo `app_metadata` y NUNCA como `role` de
-- primer nivel — ese nombre lo usa Supabase para el rol de Postgres y pisarlo
-- rompería RLS para todo el proyecto.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  claims    jsonb;
  app_meta  jsonb;
  uid       uuid := (event->>'user_id')::uuid;
  user_role text;
  user_name text;
  slugs     text[];
begin
  select role, name into user_role, user_name
  from public.profiles where id = uid;

  user_role := coalesce(user_role, 'user');

  -- El admin ve todo el catálogo; el resto, solo lo que tenga concedido.
  if user_role = 'admin' then
    select coalesce(array_agg(slug order by slug), '{}')
      into slugs
      from public.projects;
  else
    select coalesce(array_agg(p.slug order by p.slug), '{}')
      into slugs
      from public.project_access pa
      join public.projects p on p.id = pa.project_id
     where pa.user_id = uid;
  end if;

  claims   := event->'claims';
  app_meta := coalesce(claims->'app_metadata', '{}'::jsonb);
  app_meta := jsonb_set(app_meta, '{role}',     to_jsonb(user_role));
  app_meta := jsonb_set(app_meta, '{name}',     to_jsonb(coalesce(user_name, '')));
  app_meta := jsonb_set(app_meta, '{projects}', to_jsonb(slugs));
  claims   := jsonb_set(claims, '{app_metadata}', app_meta);

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- GoTrue invoca el hook autenticado como supabase_auth_admin. Ya tenía lectura
-- sobre `profiles`; ahora necesita también `projects` y `project_access`. Sin
-- estos grants + policies el hook falla y NADIE puede iniciar sesión ni
-- refrescar su token.
grant select on public.projects       to supabase_auth_admin;
grant select on public.project_access to supabase_auth_admin;

drop policy if exists "hook: leer projects para custom claims" on public.projects;
create policy "hook: leer projects para custom claims" on public.projects
  as permissive for select
  to supabase_auth_admin
  using (true);

drop policy if exists "hook: leer project_access para custom claims" on public.project_access;
create policy "hook: leer project_access para custom claims" on public.project_access
  as permissive for select
  to supabase_auth_admin
  using (true);
