-- Policies de insert/update/delete para tj_* — hasta ahora solo existían de
-- select, así que el cliente admin (service role) era la única puerta real
-- para escrituras. Espejan la lógica de ownership de sus policies de select
-- ya existentes (supabase/trading/schema.sql y
-- 20260714000000_fix_rls_missing_tables.sql).
--
-- NO se agregan policies para operaciones cruzadas entre usuarios (aceptar
-- una invitación de sesión compartida copia datos de OTRO usuario; enviar una
-- invitación lee el perfil/acceso de OTRO usuario y le crea una notificación)
-- — esos flujos siguen con el cliente admin a propósito, la autorización ya
-- está validada en el código de la ruta (estado de la invitación, ownership
-- de la sesión origen), y no es un caso que "un usuario accede a lo suyo"
-- pueda expresar. Ver app/api/trading-journal/share/route.ts y la rama
-- "accept" de app/api/trading-journal/notifications/route.ts.

-- tj_sessions (raíz)
create policy "tj: crear propias sesiones" on tj_sessions for insert
  with check (user_id = auth.uid());
create policy "tj: actualizar propias sesiones" on tj_sessions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tj: borrar propias sesiones" on tj_sessions for delete
  using (user_id = auth.uid());

-- tj_session_connections (dos sesiones, ambas deben ser del mismo dueño —
-- insert/update piden ambos lados propios, más estricto que el select que
-- solo pide uno para poder ver la conexión desde cualquiera de los dos lados)
create policy "tj: crear propias conexiones" on tj_session_connections for insert
  with check (
    exists (select 1 from tj_sessions where id = backtesting_id and user_id = auth.uid())
    and exists (select 1 from tj_sessions where id = journal_id and user_id = auth.uid())
  );
create policy "tj: actualizar propias conexiones" on tj_session_connections for update
  using (
    exists (select 1 from tj_sessions where id = backtesting_id and user_id = auth.uid())
    and exists (select 1 from tj_sessions where id = journal_id and user_id = auth.uid())
  )
  with check (
    exists (select 1 from tj_sessions where id = backtesting_id and user_id = auth.uid())
    and exists (select 1 from tj_sessions where id = journal_id and user_id = auth.uid())
  );
create policy "tj: borrar propias conexiones" on tj_session_connections for delete
  using (
    exists (select 1 from tj_sessions where id = backtesting_id and user_id = auth.uid())
    or exists (select 1 from tj_sessions where id = journal_id and user_id = auth.uid())
  );

-- tj_variable_definitions (hija de tj_sessions)
create policy "tj: crear propias variables" on tj_variable_definitions for insert
  with check (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()));
create policy "tj: actualizar propias variables" on tj_variable_definitions for update
  using (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()))
  with check (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()));
create policy "tj: borrar propias variables" on tj_variable_definitions for delete
  using (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()));

-- tj_trades (hija de tj_sessions)
create policy "tj: crear propios trades" on tj_trades for insert
  with check (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()));
create policy "tj: actualizar propios trades" on tj_trades for update
  using (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()))
  with check (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()));
create policy "tj: borrar propios trades" on tj_trades for delete
  using (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()));

-- tj_share_invitations: crear (el que envía) y actualizar estado (el que
-- recibe, para aceptar/rechazar) — sin delete, no hay ninguna ruta que borre
-- invitaciones hoy.
create policy "tj: crear invitaciones propias" on tj_share_invitations for insert
  with check (from_user_id = auth.uid());
create policy "tj: actualizar invitaciones recibidas" on tj_share_invitations for update
  using (to_email = (select email from profiles where id = auth.uid()))
  with check (to_email = (select email from profiles where id = auth.uid()));

-- tj_notifications (raíz) — sin delete, no hay ninguna ruta que borre notificaciones hoy.
create policy "tj: crear propias notificaciones" on tj_notifications for insert
  with check (user_id = auth.uid());
create policy "tj: actualizar propias notificaciones" on tj_notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- tj_ai_analyses (hija de tj_sessions) — sin rutas que la usen todavía, se
-- agrega igual por completitud/consistencia con el resto.
create policy "tj: crear propios analisis IA" on tj_ai_analyses for insert
  with check (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()));
create policy "tj: actualizar propios analisis IA" on tj_ai_analyses for update
  using (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()))
  with check (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()));
create policy "tj: borrar propios analisis IA" on tj_ai_analyses for delete
  using (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()));

-- tj_capital_transactions (hija de tj_sessions)
create policy "tj: crear propios movimientos de capital" on tj_capital_transactions for insert
  with check (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()));
create policy "tj: actualizar propios movimientos de capital" on tj_capital_transactions for update
  using (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()))
  with check (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()));
create policy "tj: borrar propios movimientos de capital" on tj_capital_transactions for delete
  using (exists (select 1 from tj_sessions where id = session_id and user_id = auth.uid()));

-- tj_merged_sessions (hija de tj_sessions vía merged_session_id — igual que su select)
create policy "tj: crear propios espejos" on tj_merged_sessions for insert
  with check (exists (select 1 from tj_sessions where id = merged_session_id and user_id = auth.uid()));
create policy "tj: borrar propios espejos" on tj_merged_sessions for delete
  using (exists (select 1 from tj_sessions where id = merged_session_id and user_id = auth.uid()));
