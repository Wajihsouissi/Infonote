-- ============================================================================
-- Infonote canonical schema
-- Tables:
--   user_profiles : 1-to-1 mirror of auth.users (id, email, created_at)
--   canvas_nodes  : per-node row owned by user_id
--   canvas_edges  : per-edge row owned by user_id
--
-- Conventions:
--   - All FKs cascade on user delete so users can fully wipe their data.
--   - RLS is ON for all three tables; users may only read/write their own rows.
--   - A trigger on auth.users -> user_profiles auto-provisions on sign-up.
--   - Updated-at auto-bump on any UPDATE for clean revisions/last-modified UI.
-- ============================================================================

-- Required extension for gen_random_uuid()
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- user_profiles
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.user_profiles (
    id          uuid        primary key references auth.users(id) on delete cascade,
    email       text        not null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles self read"   on public.user_profiles;
drop policy if exists "user_profiles self update" on public.user_profiles;
drop policy if exists "user_profiles self insert" on public.user_profiles;

create policy "user_profiles self read"
    on public.user_profiles for select
    using (auth.uid() = id);

create policy "user_profiles self update"
    on public.user_profiles for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

create policy "user_profiles self insert"
    on public.user_profiles for insert
    with check (auth.uid() = id);

-- Auto-provision profile on auth.users insert (production best-practice).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.user_profiles (id, email)
    values (new.id, coalesce(new.email, ''))
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute function public.handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- canvas_nodes
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.canvas_nodes (
    id          text        not null,
    user_id     uuid        not null references public.user_profiles(id) on delete cascade,
    parent_id   text        null,
    type        text        not null,
    x_pos       double precision not null default 0,
    y_pos       double precision not null default 0,
    width       double precision null,
    height      double precision null,
    data_json   jsonb       not null default '{}'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    primary key (user_id, id)
);

create index if not exists canvas_nodes_user_idx       on public.canvas_nodes(user_id);
create index if not exists canvas_nodes_user_parent_idx on public.canvas_nodes(user_id, parent_id);

alter table public.canvas_nodes enable row level security;

drop policy if exists "canvas_nodes owner all" on public.canvas_nodes;
create policy "canvas_nodes owner all"
    on public.canvas_nodes for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- canvas_edges
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.canvas_edges (
    id          text        not null,
    user_id     uuid        not null references public.user_profiles(id) on delete cascade,
    source_id   text        not null,
    target_id   text        not null,
    data_json   jsonb       not null default '{}'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    primary key (user_id, id)
);

create index if not exists canvas_edges_user_idx        on public.canvas_edges(user_id);
create index if not exists canvas_edges_user_source_idx on public.canvas_edges(user_id, source_id);
create index if not exists canvas_edges_user_target_idx on public.canvas_edges(user_id, target_id);

alter table public.canvas_edges enable row level security;

drop policy if exists "canvas_edges owner all" on public.canvas_edges;
create policy "canvas_edges owner all"
    on public.canvas_edges for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at auto-bump trigger (shared)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists user_profiles_touch_updated_at on public.user_profiles;
create trigger user_profiles_touch_updated_at
    before update on public.user_profiles
    for each row execute function public.touch_updated_at();

drop trigger if exists canvas_nodes_touch_updated_at on public.canvas_nodes;
create trigger canvas_nodes_touch_updated_at
    before update on public.canvas_nodes
    for each row execute function public.touch_updated_at();

drop trigger if exists canvas_edges_touch_updated_at on public.canvas_edges;
create trigger canvas_edges_touch_updated_at
    before update on public.canvas_edges
    for each row execute function public.touch_updated_at();
