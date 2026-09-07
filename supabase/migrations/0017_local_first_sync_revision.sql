-- ============================================================================
-- Local-first workspace sync foundation
--
-- 1. Make canvas identity genuinely workspace-scoped.
-- 2. Maintain one cheap revision counter per workspace so an already-hydrated
--    device can check for changes without downloading the complete graph.
-- ============================================================================

do $$
declare
    constraint_name text;
begin
    select c.conname into constraint_name
    from pg_constraint c
    where c.conrelid = 'public.canvas_nodes'::regclass
      and c.contype = 'p';

    if constraint_name is not null then
        execute format('alter table public.canvas_nodes drop constraint %I', constraint_name);
    end if;

    alter table public.canvas_nodes
        add constraint canvas_nodes_pkey primary key (workspace_id, id);

    select c.conname into constraint_name
    from pg_constraint c
    where c.conrelid = 'public.canvas_edges'::regclass
      and c.contype = 'p';

    if constraint_name is not null then
        execute format('alter table public.canvas_edges drop constraint %I', constraint_name);
    end if;

    alter table public.canvas_edges
        add constraint canvas_edges_pkey primary key (workspace_id, id);
end $$;

create table if not exists public.workspace_sync_state (
    workspace_id uuid primary key references public.workspaces(id) on delete cascade,
    revision bigint not null default 0 check (revision >= 0),
    updated_at timestamptz not null default now(),
    updated_by uuid null references auth.users(id) on delete set null
);

insert into public.workspace_sync_state (workspace_id, revision)
select id, 0
from public.workspaces
on conflict (workspace_id) do nothing;

alter table public.workspace_sync_state enable row level security;

drop policy if exists "workspace sync state readable by members" on public.workspace_sync_state;
create policy "workspace sync state readable by members"
    on public.workspace_sync_state for select
    using (public.is_workspace_member(workspace_id, auth.uid()));

create or replace function public.bump_workspace_sync_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    target_workspace_id uuid;
begin
    target_workspace_id := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;

    insert into public.workspace_sync_state (workspace_id, revision, updated_at, updated_by)
    values (target_workspace_id, 1, now(), auth.uid())
    on conflict (workspace_id) do update
    set revision = public.workspace_sync_state.revision + 1,
        updated_at = now(),
        updated_by = auth.uid();

    return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists canvas_nodes_bump_workspace_revision on public.canvas_nodes;
create trigger canvas_nodes_bump_workspace_revision
    after insert or update or delete on public.canvas_nodes
    for each row execute function public.bump_workspace_sync_revision();

drop trigger if exists canvas_edges_bump_workspace_revision on public.canvas_edges;
create trigger canvas_edges_bump_workspace_revision
    after insert or update or delete on public.canvas_edges
    for each row execute function public.bump_workspace_sync_revision();

create or replace function public.get_workspace_sync_revision(_workspace_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    value bigint;
begin
    if not public.is_workspace_member(_workspace_id, auth.uid()) then
        raise exception 'Not allowed to read this workspace';
    end if;

    select revision into value
    from public.workspace_sync_state
    where workspace_id = _workspace_id;

    return coalesce(value, 0);
end;
$$;

grant execute on function public.get_workspace_sync_revision(uuid) to authenticated;
revoke insert, update, delete on public.workspace_sync_state from authenticated;

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'workspace_sync_state'
       ) then
        alter publication supabase_realtime add table public.workspace_sync_state;
    end if;
end $$;

