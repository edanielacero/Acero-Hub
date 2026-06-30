-- ============================================
-- FIX: prevent privilege escalation via self-update
-- ============================================
-- The "Actualizar propio perfil" RLS policy on profiles only restricts
-- WHICH ROW a user can update (id = auth.uid()), not WHICH COLUMNS. Since it
-- has no WITH CHECK clause, any authenticated user could run:
--   supabase.from('profiles').update({ role: 'admin' }).eq('id', myId)
-- directly from the browser and grant themselves admin — bypassing every
-- admin-gated page and API route in the hub (including /mundial/admin).
--
-- This trigger silently reverts the `role` column to its previous value
-- whenever someone who isn't already an admin tries to change it. Updates
-- made via the service role key (admin API routes, scripts) are unaffected
-- since those bypass RLS/auth.uid() entirely and are already gated by
-- application-level admin checks.

create or replace function prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_role_escalation on profiles;
create trigger trg_prevent_self_role_escalation
  before update on profiles
  for each row execute procedure prevent_self_role_escalation();
