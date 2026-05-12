-- ============================================================================
-- Infonote initial schema
-- Paste this into the Supabase SQL editor (https://supabase.com/dashboard ->
-- Project -> SQL) and run it. It is idempotent via IF NOT EXISTS where safe.
-- ============================================================================

-- Extensions ----------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- profiles ------------------------------------------------------------------
-- One row per authenticated user. Linked 1:1 to auth.users.
create table if not exists public.profiles (
    id           uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are self-readable" on public.profiles;
create policy "profiles are self-readable"
    on public.profiles for select
    using (auth.uid() = id);

drop policy if exists "profiles are self-insertable" on public.profiles;
create policy "profiles are self-insertable"
    on public.profiles for insert
    with check (auth.uid() = id);

drop policy if exists "profiles are self-updatable" on public.profiles;
create policy "profiles are self-updatable"
    on public.profiles for update
    using (auth.uid() = id);

-- Auto-create a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email))
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- workspaces ----------------------------------------------------------------
create table if not exists public.workspaces (
    id         uuid primary key default uuid_generate_v4(),
    owner_id   uuid not null references public.profiles(id) on delete cascade,
    name       text not null default 'My Workspace',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists workspaces_owner_idx on public.workspaces(owner_id);

alter table public.workspaces enable row level security;

-- workspace_members ---------------------------------------------------------
-- Owner gets 'owner'; additional members can be 'editor' or 'viewer'.
create table if not exists public.workspace_members (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    user_id      uuid not null references public.profiles(id) on delete cascade,
    role         text not null check (role in ('owner', 'editor', 'viewer')),
    created_at   timestamptz not null default now(),
    primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx on public.workspace_members(user_id);

alter table public.workspace_members enable row level security;

-- Owner auto-membership on workspace insert.
create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.workspace_members (workspace_id, user_id, role)
    values (new.id, new.owner_id, 'owner')
    on conflict do nothing;
    return new;
end;
$$;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
    after insert on public.workspaces
    for each row execute function public.handle_new_workspace();

-- Membership helper used by workspace + snapshot policies.
create or replace function public.is_workspace_member(_workspace uuid, _user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.workspace_members
        where workspace_id = _workspace and user_id = _user
    );
$$;

create or replace function public.can_write_workspace(_workspace uuid, _user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.workspace_members
        where workspace_id = _workspace
          and user_id = _user
          and role in ('owner', 'editor')
    );
$$;

-- workspace policies
drop policy if exists "workspaces readable by members" on public.workspaces;
create policy "workspaces readable by members"
    on public.workspaces for select
    using (public.is_workspace_member(id, auth.uid()));

drop policy if exists "workspaces insertable by owner" on public.workspaces;
create policy "workspaces insertable by owner"
    on public.workspaces for insert
    with check (owner_id = auth.uid());

drop policy if exists "workspaces updatable by owner" on public.workspaces;
create policy "workspaces updatable by owner"
    on public.workspaces for update
    using (owner_id = auth.uid());

drop policy if exists "workspaces deletable by owner" on public.workspaces;
create policy "workspaces deletable by owner"
    on public.workspaces for delete
    using (owner_id = auth.uid());

-- workspace_members policies
drop policy if exists "members readable by self or owner" on public.workspace_members;
create policy "members readable by self or owner"
    on public.workspace_members for select
    using (
        user_id = auth.uid()
        or exists (
            select 1 from public.workspaces w
            where w.id = workspace_id and w.owner_id = auth.uid()
        )
    );

drop policy if exists "members manageable by owner" on public.workspace_members;
create policy "members manageable by owner"
    on public.workspace_members for all
    using (
        exists (
            select 1 from public.workspaces w
            where w.id = workspace_id and w.owner_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from public.workspaces w
            where w.id = workspace_id and w.owner_id = auth.uid()
        )
    );

-- graph_snapshots -----------------------------------------------------------
-- v1 storage model: one row per workspace holding the whole nodes/edges blob.
-- This mirrors the current file-system layout (nodes.json + edges.json) so the
-- app can treat cloud/local symmetrically. Normalized per-node rows can come
-- later without breaking this contract.
create table if not exists public.graph_snapshots (
    workspace_id uuid primary key references public.workspaces(id) on delete cascade,
    nodes        jsonb not null default '[]'::jsonb,
    edges        jsonb not null default '[]'::jsonb,
    version      bigint not null default 1,
    updated_at   timestamptz not null default now(),
    updated_by   uuid references public.profiles(id) on delete set null
);

alter table public.graph_snapshots enable row level security;

drop policy if exists "snapshots readable by members" on public.graph_snapshots;
create policy "snapshots readable by members"
    on public.graph_snapshots for select
    using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "snapshots insertable by writers" on public.graph_snapshots;
create policy "snapshots insertable by writers"
    on public.graph_snapshots for insert
    with check (public.can_write_workspace(workspace_id, auth.uid()));

drop policy if exists "snapshots updatable by writers" on public.graph_snapshots;
create policy "snapshots updatable by writers"
    on public.graph_snapshots for update
    using (public.can_write_workspace(workspace_id, auth.uid()));

drop policy if exists "snapshots deletable by writers" on public.graph_snapshots;
create policy "snapshots deletable by writers"
    on public.graph_snapshots for delete
    using (public.can_write_workspace(workspace_id, auth.uid()));

-- Keep workspaces.updated_at and snapshot.version in sync on snapshot write.
create or replace function public.bump_snapshot_metadata()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    if tg_op = 'UPDATE' then
        new.version := coalesce(old.version, 0) + 1;
    end if;
    update public.workspaces
       set updated_at = now()
     where id = new.workspace_id;
    return new;
end;
$$;

drop trigger if exists bump_snapshot_metadata_trg on public.graph_snapshots;
create trigger bump_snapshot_metadata_trg
    before insert or update on public.graph_snapshots
    for each row execute function public.bump_snapshot_metadata();
