-- ============================================================================
-- Workspace-scoped cloud sync for the production canvas_nodes/canvas_edges path.
--
-- The Vite client writes to canvas_nodes/canvas_edges, not the older
-- nodes/connections tables. This migration makes those rows private to both
-- the authenticated user and their active workspace.
-- ============================================================================

create extension if not exists pgcrypto;

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

do $$
begin
    if not exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'is_workspace_member'
          and pg_get_function_identity_arguments(p.oid) = 'uuid, uuid'
    ) then
        execute $fn$
            create function public.is_workspace_member(_workspace_id uuid, _user_id uuid)
            returns boolean
            language sql
            security definer
            set search_path = public
            as $body$
                select exists (
                    select 1
                    from public.workspaces
                    where id = _workspace_id
                      and owner_id = _user_id
                );
            $body$;
        $fn$;
    end if;
end $$;

insert into public.workspaces (owner_id, name)
select u.id, 'My Workspace'
from auth.users u
where not exists (
    select 1 from public.workspaces w where w.owner_id = u.id
);

alter table public.canvas_nodes
    add column if not exists workspace_id uuid;

alter table public.canvas_edges
    add column if not exists workspace_id uuid;

with first_workspace as (
    select distinct on (owner_id) owner_id, id
    from public.workspaces
    order by owner_id, created_at asc
)
update public.canvas_nodes cn
set workspace_id = fw.id
from first_workspace fw
where cn.user_id = fw.owner_id
  and cn.workspace_id is null;

with first_workspace as (
    select distinct on (owner_id) owner_id, id
    from public.workspaces
    order by owner_id, created_at asc
)
update public.canvas_edges ce
set workspace_id = fw.id
from first_workspace fw
where ce.user_id = fw.owner_id
  and ce.workspace_id is null;

alter table public.canvas_nodes
    alter column workspace_id set not null;

alter table public.canvas_edges
    alter column workspace_id set not null;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'canvas_nodes_workspace_fk'
    ) then
        alter table public.canvas_nodes
            add constraint canvas_nodes_workspace_fk
            foreign key (workspace_id) references public.workspaces(id) on delete cascade;
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'canvas_edges_workspace_fk'
    ) then
        alter table public.canvas_edges
            add constraint canvas_edges_workspace_fk
            foreign key (workspace_id) references public.workspaces(id) on delete cascade;
    end if;
end $$;

create index if not exists canvas_nodes_workspace_idx
    on public.canvas_nodes(workspace_id);

create index if not exists canvas_edges_workspace_idx
    on public.canvas_edges(workspace_id);

create unique index if not exists canvas_nodes_user_workspace_id_uidx
    on public.canvas_nodes(user_id, workspace_id, id);

create unique index if not exists canvas_edges_user_workspace_id_uidx
    on public.canvas_edges(user_id, workspace_id, id);

drop policy if exists "canvas_nodes owner all" on public.canvas_nodes;
drop policy if exists "canvas_nodes workspace member all" on public.canvas_nodes;
create policy "canvas_nodes workspace member all"
    on public.canvas_nodes for all
    using (
        auth.uid() = user_id
        and public.is_workspace_member(workspace_id, auth.uid())
    )
    with check (
        auth.uid() = user_id
        and public.is_workspace_member(workspace_id, auth.uid())
    );

drop policy if exists "canvas_edges owner all" on public.canvas_edges;
drop policy if exists "canvas_edges workspace member all" on public.canvas_edges;
create policy "canvas_edges workspace member all"
    on public.canvas_edges for all
    using (
        auth.uid() = user_id
        and public.is_workspace_member(workspace_id, auth.uid())
    )
    with check (
        auth.uid() = user_id
        and public.is_workspace_member(workspace_id, auth.uid())
    );
