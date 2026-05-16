-- ============================================================================
-- Dashboard Features Schema
-- Adds tracking for recently viewed notes and a global search RPC function.
-- ============================================================================

-- recently_viewed_notes -----------------------------------------------------
create table if not exists public.recently_viewed_notes (
    id             uuid primary key default uuid_generate_v4(),
    user_id        uuid not null references public.profiles(id) on delete cascade,
    workspace_id   uuid not null references public.workspaces(id) on delete cascade,
    node_id        text not null,
    node_title     text,
    node_type      text,
    last_opened_at timestamptz not null default now(),
    
    unique (user_id, workspace_id, node_id)
);

create index if not exists recently_viewed_user_idx on public.recently_viewed_notes(user_id, last_opened_at desc);

alter table public.recently_viewed_notes enable row level security;

drop policy if exists "recently_viewed manageable by user" on public.recently_viewed_notes;
create policy "recently_viewed manageable by user"
    on public.recently_viewed_notes for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());


-- search_notes RPC ----------------------------------------------------------
-- Searches the JSONB nodes array within a specific workspace for the query.
drop function if exists public.search_notes(text, uuid);
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
    -- Ensure the user actually has access to this workspace
    if not public.is_workspace_member(_workspace_id, auth.uid()) then
        return;
    end if;

    return query
    select 
        (node->>'id')::text as node_id,
        (node->>'type')::text as node_type,
        coalesce((node->'data'->>'title')::text, 'Untitled') as node_title,
        substring(coalesce((node->'data'->>'content')::text, '') from 1 for 100) as content_snippet
    from public.graph_snapshots gs,
         jsonb_array_elements(gs.nodes) as node
    where gs.workspace_id = _workspace_id
      and (
          (node->'data'->>'title') ilike '%' || search_query || '%'
          or 
          (node->'data'->>'content') ilike '%' || search_query || '%'
      );
end;
$$;
