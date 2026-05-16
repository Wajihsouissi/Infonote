-- ============================================================================
-- Normalized Canvas Schema
-- Moves from JSONB blobs to individual rows for nodes and connections.
-- ============================================================================

-- nodes ---------------------------------------------------------------------
create table if not exists public.nodes (
    id           text not null,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    user_id      uuid not null references public.profiles(id) on delete cascade,
    type         text not null,
    x_pos        float not null,
    y_pos        float not null,
    data         jsonb not null default '{}'::jsonb,
    updated_at   timestamptz not null default now(),
    
    primary key (workspace_id, id)
);

create index if not exists nodes_user_idx on public.nodes(user_id);
create index if not exists nodes_workspace_idx on public.nodes(workspace_id);

alter table public.nodes enable row level security;

-- connections ---------------------------------------------------------------
create table if not exists public.connections (
    id           text not null,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    user_id      uuid not null references public.profiles(id) on delete cascade,
    source_id    text not null,
    target_id    text not null,
    data         jsonb not null default '{}'::jsonb,
    updated_at   timestamptz not null default now(),
    
    primary key (workspace_id, id)
);

create index if not exists connections_user_idx on public.connections(user_id);
create index if not exists connections_workspace_idx on public.connections(workspace_id);

alter table public.connections enable row level security;

-- Policies -----------------------------------------------------------------
-- Ensure users can only manage nodes/connections in workspaces they belong to.

drop policy if exists "nodes manageable by members" on public.nodes;
create policy "nodes manageable by members"
    on public.nodes for all
    using (public.is_workspace_member(workspace_id, auth.uid()))
    with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "connections manageable by members" on public.connections;
create policy "connections manageable by members"
    on public.connections for all
    using (public.is_workspace_member(workspace_id, auth.uid()))
    with check (public.is_workspace_member(workspace_id, auth.uid()));

-- Search RPC Update --------------------------------------------------------
-- Overwrites the search function from 0002 to use the new normalized table.
create or replace function public.search_notes(search_query text, _workspace_id uuid)
returns table (
    node_id text,
    node_type text,
    node_title text,
    content_snippet text
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_workspace_member(_workspace_id, auth.uid()) then
        return;
    end if;

    return query
    select 
        n.id as node_id,
        n.type as node_type,
        coalesce((n.data->>'title')::text, 'Untitled') as node_title,
        substring(coalesce((n.data->>'content')::text, '') from 1 for 100) as content_snippet
    from public.nodes n
    where n.workspace_id = _workspace_id
      and (
          (n.data->>'title') ilike '%' || search_query || '%'
          or 
          (n.data->>'content') ilike '%' || search_query || '%'
      );
end;
$$;
