-- ============================================================================
-- Workspaces table + is_workspace_member function (safe re-creation)
-- Handles the case where the function already exists with different param names.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- 1. Create workspaces table (idempotent)
create table if not exists public.workspaces (
    id          uuid primary key default gen_random_uuid(),
    owner_id    uuid not null references auth.users(id) on delete cascade,
    name        text not null default 'My Workspace',
    created_at  timestamptz not null default now()
);

create index if not exists workspaces_owner_idx on public.workspaces(owner_id);

alter table public.workspaces enable row level security;

drop policy if exists "workspaces owner all" on public.workspaces;
create policy "workspaces owner all"
    on public.workspaces for all
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());

-- 2. Drop ALL dependent RLS policies that reference is_workspace_member
--    (from 0003_normalized_canvas.sql)
drop policy if exists "workspaces readable by members" on public.workspaces;
drop policy if exists "snapshots readable by members" on public.graph_snapshots;
drop policy if exists "nodes manageable by members" on public.nodes;
drop policy if exists "connections manageable by members" on public.connections;

-- 3. Drop the function (now safe since dependent policies are gone)
drop function if exists public.is_workspace_member(uuid, uuid);

-- 4. Recreate with correct parameter names
create or replace function public.is_workspace_member(_workspace_id uuid, _user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.workspaces
        where id = _workspace_id and owner_id = _user_id
    );
$$;

-- 5. Re-apply all dropped policies exactly as originally defined
create policy "workspaces readable by members"
    on public.workspaces for select
    using (public.is_workspace_member(id, auth.uid()));

create policy "snapshots readable by members"
    on public.graph_snapshots for select
    using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "nodes manageable by members"
    on public.nodes for all
    using (public.is_workspace_member(workspace_id, auth.uid()))
    with check (public.is_workspace_member(workspace_id, auth.uid()));

create policy "connections manageable by members"
    on public.connections for all
    using (public.is_workspace_member(workspace_id, auth.uid()))
    with check (public.is_workspace_member(workspace_id, auth.uid()));
