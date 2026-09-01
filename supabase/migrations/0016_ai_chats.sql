-- Account-private AI conversation history. The browser keeps a local
-- IndexedDB cache as well, but this is the authoritative cross-device copy.
create table if not exists public.ai_chats (
    id uuid primary key,
    user_id uuid not null references public.user_profiles(id) on delete cascade,
    workspace_id uuid null references public.workspaces(id) on delete set null,
    board_id uuid null,
    title text not null check (char_length(title) between 1 and 120),
    messages_json jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists ai_chats_user_updated_idx
    on public.ai_chats(user_id, updated_at desc);

alter table public.ai_chats enable row level security;

drop policy if exists "AI chats are private to their owner" on public.ai_chats;
create policy "AI chats are private to their owner"
    on public.ai_chats for select
    using (user_id = auth.uid());

drop policy if exists "AI chats are insertable by their owner" on public.ai_chats;
create policy "AI chats are insertable by their owner"
    on public.ai_chats for insert
    with check (user_id = auth.uid());

drop policy if exists "AI chats are editable by their owner" on public.ai_chats;
create policy "AI chats are editable by their owner"
    on public.ai_chats for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "AI chats are deletable by their owner" on public.ai_chats;
create policy "AI chats are deletable by their owner"
    on public.ai_chats for delete
    using (user_id = auth.uid());
