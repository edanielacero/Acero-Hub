-- profiles tenía select ("propio o admin") y update ("propio"), pero ninguna
-- policy de delete — así que borrar el perfil de OTRO usuario (gestión de
-- cuentas por un admin, app/api/admin/users/[id]/route.ts) dependía
-- enteramente del cliente admin. project_access ya tenía "for all
-- using (is_admin())" desde supabase/schema.sql, cubre su propio delete.
-- invitations queda afuera a propósito: sin RLS por diseño (comentario
-- explícito en schema.sql), solo se toca vía service role.
create policy "Admin borra cualquier perfil" on profiles for delete
  using (is_admin());
