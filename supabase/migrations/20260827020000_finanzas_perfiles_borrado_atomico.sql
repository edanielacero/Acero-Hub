-- Finanzas · Sprint 8: el borrado de un perfil pasa a ser atómico.
--
-- BUG que arregla (encontrado en revisión, 2026-08-27):
--
--   `DELETE /api/finanzas/profiles/[id]` borraba primero las categorías
--   sembradas y después el perfil. Si el perfil tenía CUALQUIER otro dato —una
--   persona, un fijo, un ahorro—, el segundo delete fallaba por el
--   `on delete restrict`, la ruta devolvía 409… y las 14 categorías ya no
--   estaban. El perfil sobrevivía vacío de categorías, sin que nada lo dijera.
--
--   Se veía así: crear un perfil, cargarle una persona, intentar borrarlo. La
--   app decía "archívalo en vez de borrarlo" y el perfil quedaba inutilizable.
--
-- Dos funciones. Las dos corren en UNA transacción, que es lo que faltaba: si
-- el borrado del perfil falla, el de las categorías se deshace con él.

-- ─────────────────────────────────────────────────────────────────────────────
-- ¿Qué perfiles tienen algo cargado?
--
-- Es lo que decide si Ajustes ofrece **Borrar** o **Archivar**, así que tiene
-- que mirar las 16 tablas y no solo cuentas y movimientos: un perfil con una
-- persona cargada no está vacío, aunque no tenga un centavo.
--
-- Las categorías quedan afuera a propósito: todo perfil nace con 14, y exigir
-- borrarlas a mano para poder borrar el perfil sería un trámite absurdo.
--
-- Va como función y no como 16 consultas desde el server porque el listado las
-- necesita para CADA perfil: serían 16×N viajes para pintar un menú.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function fin_profile_has_data(p_profile uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (select 1 from fin_accounts             where profile_id = p_profile)
      or exists (select 1 from fin_transactions         where profile_id = p_profile)
      or exists (select 1 from fin_people               where profile_id = p_profile)
      or exists (select 1 from fin_debts                where profile_id = p_profile)
      or exists (select 1 from fin_debt_plans           where profile_id = p_profile)
      or exists (select 1 from fin_recurring            where profile_id = p_profile)
      or exists (select 1 from fin_recurring_splits     where profile_id = p_profile)
      or exists (select 1 from fin_pasanaku             where profile_id = p_profile)
      or exists (select 1 from fin_pasanaku_historico   where profile_id = p_profile)
      or exists (select 1 from fin_budget_periods       where profile_id = p_profile)
      or exists (select 1 from fin_budget_lines         where profile_id = p_profile)
      or exists (select 1 from fin_budget_line_categories where profile_id = p_profile)
      or exists (select 1 from fin_budget_extensions    where profile_id = p_profile)
      or exists (select 1 from fin_budget_closures      where profile_id = p_profile)
      or exists (select 1 from fin_savings_goals        where profile_id = p_profile)
      or exists (select 1 from fin_savings_closures     where profile_id = p_profile);
$$;

-- `security invoker`: corre con los permisos de quien llama, así que RLS sigue
-- aplicando y nadie puede preguntar por un perfil ajeno.

-- ─────────────────────────────────────────────────────────────────────────────
-- Borrar un perfil vacío, en una sola transacción.
--
-- Devuelve el motivo del rechazo, o null si borró. Que el server reciba un
-- motivo y no una excepción es lo que le permite responder 409 con un mensaje
-- que sirva, en vez del error crudo de Postgres.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function fin_delete_profile(p_profile uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_default boolean;
begin
  select is_default into v_default
  from fin_profiles
  where id = p_profile and user_id = auth.uid();

  if v_default is null then
    return 'not_found';
  end if;

  if v_default then
    return 'is_default';
  end if;

  if fin_profile_has_data(p_profile) then
    return 'has_data';
  end if;

  -- Recién acá se toca algo. Los dos deletes son de la misma transacción: si el
  -- segundo falla por un `on delete restrict` que este chequeo no previó, el
  -- primero se deshace y el perfil queda intacto — que es exactamente lo que
  -- no pasaba antes.
  delete from fin_categories where profile_id = p_profile;
  delete from fin_profiles   where id = p_profile and user_id = auth.uid();

  return null;
end;
$$;
