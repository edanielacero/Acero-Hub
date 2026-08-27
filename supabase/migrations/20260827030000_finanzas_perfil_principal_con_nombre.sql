-- Finanzas · Sprint 8: el perfil principal se llama como su dueño.
--
-- Nacía como "Personal" —un nombre genérico— y a partir de ahora toma el nombre
-- de pila del usuario, que es como la app ya lo saluda en la Home. Con eso el
-- encabezado dice lo mismo tengas un perfil o tres: con uno saluda al usuario,
-- con varios muestra el nombre del perfil activo, que para el principal es el
-- mismo texto.
--
-- Se usa el nombre de PILA y no el completo por esa misma consistencia: el
-- título mostraría "Daniel" con un perfil y "Daniel Acero" con dos.
--
-- Sigue siendo editable: el principal es indeleble, no inmutable.

do $$
declare
  r record;
  pila text;
begin
  for r in
    select p.id, p.user_id, pr.name as nombre
    from fin_profiles p
    join public.profiles pr on pr.id = p.user_id
    where p.is_default
      -- Solo los que nadie renombró. Si el usuario ya le puso otra cosa, esa
      -- decisión manda sobre este default.
      and p.name = 'Personal'
      and coalesce(btrim(pr.name), '') <> ''
  loop
    pila := split_part(btrim(r.nombre), ' ', 1);
    if pila = '' then
      continue;
    end if;

    -- El `unique (user_id, name)` no perdona: si ya existe otro perfil con ese
    -- nombre, se deja "Personal" como estaba en vez de hacer fallar la
    -- migración por un caso de borde.
    if exists (
      select 1 from fin_profiles x
      where x.user_id = r.user_id and x.id <> r.id and lower(x.name) = lower(pila)
    ) then
      continue;
    end if;

    update fin_profiles
       set name = pila, updated_at = now()
     where id = r.id;
  end loop;
end $$;
