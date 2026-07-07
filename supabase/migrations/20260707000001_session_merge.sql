-- Sprint: Fusionar sesiones

ALTER TABLE public.tj_sessions ADD COLUMN IF NOT EXISTS is_read_only boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.tj_merged_sessions (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  merged_session_id uuid NOT NULL REFERENCES public.tj_sessions(id) ON DELETE CASCADE,
  source_session_id uuid NOT NULL REFERENCES public.tj_sessions(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(merged_session_id, source_session_id)
);

CREATE INDEX IF NOT EXISTS tj_merged_sessions_merged_idx ON public.tj_merged_sessions (merged_session_id);
CREATE INDEX IF NOT EXISTS tj_merged_sessions_source_idx ON public.tj_merged_sessions (source_session_id);
