-- profiles solo tenía policy de update "propio" (id = auth.uid()), así que
-- un admin editando el nombre/email de OTRO usuario (app/api/admin/users/[id]/route.ts,
-- PATCH) no tenía forma de escribir vía el cliente RLS. La escalación de rol
-- sigue bloqueada por el trigger prevent_self_role_escalation, que solo revierte
-- el campo `role` y no afecta esta policy.
create policy "Admin actualiza cualquier perfil" on profiles for update
  using (is_admin());
