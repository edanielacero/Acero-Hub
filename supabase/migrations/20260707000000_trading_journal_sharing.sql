-- Sprint 9: Compartir sesiones y Notificaciones

CREATE TABLE IF NOT EXISTS public.tj_share_invitations (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_email     text NOT NULL,
  session_id   uuid NOT NULL REFERENCES public.tj_sessions(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tj_notifications (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tj_share_invitations_from_user_idx ON public.tj_share_invitations (from_user_id);
CREATE INDEX IF NOT EXISTS tj_share_invitations_session_idx   ON public.tj_share_invitations (session_id);
CREATE INDEX IF NOT EXISTS tj_notifications_user_idx          ON public.tj_notifications (user_id);
CREATE INDEX IF NOT EXISTS tj_notifications_unread_idx        ON public.tj_notifications (user_id, read);
