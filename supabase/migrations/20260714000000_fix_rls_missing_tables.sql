-- Fix: habilitar RLS en tablas creadas por migraciones sin RLS
-- tj_share_invitations, tj_notifications y tj_merged_sessions fueron
-- creadas en migraciones que no incluían el setup de RLS.
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY es idempotente.
-- DROP POLICY IF EXISTS evita errores si las políticas ya existían del schema.sql.

-- tj_share_invitations
ALTER TABLE public.tj_share_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tj: leer invitaciones enviadas"  ON public.tj_share_invitations;
DROP POLICY IF EXISTS "tj: leer invitaciones recibidas" ON public.tj_share_invitations;

CREATE POLICY "tj: leer invitaciones enviadas" ON public.tj_share_invitations FOR SELECT
  USING (from_user_id = auth.uid());
CREATE POLICY "tj: leer invitaciones recibidas" ON public.tj_share_invitations FOR SELECT
  USING (to_email = (SELECT email FROM profiles WHERE id = auth.uid()));

-- tj_notifications
ALTER TABLE public.tj_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tj: leer propias notificaciones" ON public.tj_notifications;

CREATE POLICY "tj: leer propias notificaciones" ON public.tj_notifications FOR SELECT
  USING (user_id = auth.uid());

-- tj_merged_sessions
ALTER TABLE public.tj_merged_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tj: leer propios espejos" ON public.tj_merged_sessions;

CREATE POLICY "tj: leer propios espejos" ON public.tj_merged_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tj_sessions
      WHERE id = merged_session_id AND user_id = auth.uid()
    )
  );
