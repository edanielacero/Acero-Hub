-- ============================================
-- ACERO IA — Schema
-- ============================================

-- PRESETS (system prompts)
create table if not exists aia_presets (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references profiles(id) on delete cascade,
  name          text not null,
  system_prompt text not null,
  is_default    boolean default false,
  is_global     boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- CONVERSATIONS
create table if not exists aia_conversations (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  title           text,
  preset_id       uuid references aia_presets(id) on delete set null,
  last_model_used text,
  is_archived     boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- MESSAGES
create table if not exists aia_messages (
  id              uuid default gen_random_uuid() primary key,
  conversation_id uuid references aia_conversations(id) on delete cascade not null,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  model_used      text,
  model_suggested text,
  user_accepted   boolean,
  tokens_input    int default 0,
  tokens_output   int default 0,
  cost_usd        numeric default 0,
  image_ids       uuid[] default '{}',
  parent_id       uuid references aia_messages(id) on delete set null,
  is_regenerated  boolean default false,
  created_at      timestamptz default now()
);

-- IMAGES
create table if not exists aia_images (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  conversation_id uuid references aia_conversations(id) on delete set null,
  message_id      uuid references aia_messages(id) on delete set null,
  prompt          text not null,
  revised_prompt  text,
  storage_path    text not null,
  size            text not null check (size in ('1024x1024', '1792x1024', '1024x1792')),
  quality         text not null check (quality in ('low', 'medium', 'high')),
  cost_usd        numeric not null default 0,
  parent_image_id uuid references aia_images(id) on delete set null,
  created_at      timestamptz default now()
);

-- USAGE LOGS
create table if not exists aia_usage_logs (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  conversation_id uuid references aia_conversations(id) on delete set null,
  message_id      uuid references aia_messages(id) on delete set null,
  model           text not null,
  tokens_input    int default 0,
  tokens_output   int default 0,
  cost_usd        numeric not null,
  created_at      timestamptz default now()
);

-- USAGE LIMITS
create table if not exists aia_usage_limits (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references profiles(id) on delete cascade not null unique,
  monthly_limit numeric default 10.00,
  limit_start   timestamptz default now(),
  is_unlimited  boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ALERTS
create table if not exists aia_alerts (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references profiles(id) on delete cascade,
  threshold_pct int,
  threshold_usd numeric,
  type          text not null check (type in ('percentage', 'fixed')),
  notified      boolean default false,
  created_at    timestamptz default now()
);

-- ============================================
-- INDEXES
-- ============================================
create index if not exists idx_aia_conversations_user on aia_conversations(user_id);
create index if not exists idx_aia_messages_conversation on aia_messages(conversation_id);
create index if not exists idx_aia_messages_parent on aia_messages(parent_id);
create index if not exists idx_aia_images_user on aia_images(user_id);
create index if not exists idx_aia_images_conversation on aia_images(conversation_id);
create index if not exists idx_aia_usage_logs_user on aia_usage_logs(user_id);
create index if not exists idx_aia_usage_logs_created on aia_usage_logs(created_at);
create index if not exists idx_aia_presets_user on aia_presets(user_id);

-- ============================================
-- RLS (Row Level Security)
-- ============================================
alter table aia_conversations enable row level security;
alter table aia_messages      enable row level security;
alter table aia_presets       enable row level security;
alter table aia_images        enable row level security;
alter table aia_usage_logs    enable row level security;
alter table aia_usage_limits  enable row level security;
alter table aia_alerts        enable row level security;

-- Conversations: usuario ve las suyas, admin ve todas
create policy "aia_conversations_select" on aia_conversations for select
  using (user_id = auth.uid() or is_admin());
create policy "aia_conversations_insert" on aia_conversations for insert
  with check (user_id = auth.uid());
create policy "aia_conversations_update" on aia_conversations for update
  using (user_id = auth.uid());
create policy "aia_conversations_delete" on aia_conversations for delete
  using (user_id = auth.uid());

-- Messages: usuario ve mensajes de sus conversaciones
create policy "aia_messages_select" on aia_messages for select
  using (
    exists (
      select 1 from aia_conversations
      where id = aia_messages.conversation_id
      and (user_id = auth.uid() or is_admin())
    )
  );
create policy "aia_messages_insert" on aia_messages for insert
  with check (
    exists (
      select 1 from aia_conversations
      where id = aia_messages.conversation_id
      and user_id = auth.uid()
    )
  );
create policy "aia_messages_update" on aia_messages for update
  using (
    exists (
      select 1 from aia_conversations
      where id = aia_messages.conversation_id
      and user_id = auth.uid()
    )
  );

-- Presets: usuario ve los suyos + globales
create policy "aia_presets_select" on aia_presets for select
  using (user_id = auth.uid() or is_global = true or is_admin());
create policy "aia_presets_insert" on aia_presets for insert
  with check (user_id = auth.uid() or is_admin());
create policy "aia_presets_update" on aia_presets for update
  using (user_id = auth.uid() or is_admin());
create policy "aia_presets_delete" on aia_presets for delete
  using (user_id = auth.uid() or is_admin());

-- Images: usuario ve las suyas
create policy "aia_images_select" on aia_images for select
  using (user_id = auth.uid() or is_admin());
create policy "aia_images_insert" on aia_images for insert
  with check (user_id = auth.uid());

-- Usage logs: usuario ve los suyos, admin ve todos
create policy "aia_usage_logs_select" on aia_usage_logs for select
  using (user_id = auth.uid() or is_admin());
create policy "aia_usage_logs_insert" on aia_usage_logs for insert
  with check (user_id = auth.uid());

-- Usage limits: usuario ve el suyo, admin ve y edita todos
create policy "aia_usage_limits_select" on aia_usage_limits for select
  using (user_id = auth.uid() or is_admin());
create policy "aia_usage_limits_insert" on aia_usage_limits for insert
  with check (is_admin());
create policy "aia_usage_limits_update" on aia_usage_limits for update
  using (is_admin());

-- Alerts: solo admin
create policy "aia_alerts_select" on aia_alerts for select
  using (is_admin());
create policy "aia_alerts_insert" on aia_alerts for insert
  with check (is_admin());
create policy "aia_alerts_update" on aia_alerts for update
  using (is_admin());
create policy "aia_alerts_delete" on aia_alerts for delete
  using (is_admin());

-- ============================================
-- SEED: registrar proyecto en el hub
-- ============================================
insert into projects (name, slug, description)
values (
  'Acero IA',
  'acero-ia',
  'Plataforma de inteligencia artificial con routing inteligente de modelos, generación de imágenes y control de costos.'
)
on conflict (slug) do nothing;
