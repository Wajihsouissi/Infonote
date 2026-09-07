-- ============================================================================
-- Bump the workspace sync revision once per STATEMENT, not once per ROW.
--
-- Migration 0017 attached `bump_workspace_sync_revision` `for each row`. Saves
-- here are chunked upserts of up to 500 canvas rows, so one ordinary save ran
-- 500 sequential upserts against the SAME workspace_sync_state row: a hot row
-- serialising on itself, 500 dead tuples per save, and 500 realtime events for
-- a single logical change — every one of them delivered back to the client that
-- had just written them.
--
-- A statement-level trigger with transition tables produces exactly one bump
-- per statement and one realtime event per chunk. The counter keeps its only
-- contract: it changes whenever canvas rows change. Nothing reads it as a count
-- of anything, so collapsing per-row increments into one is safe.
-- ============================================================================

create or replace function public.bump_workspace_sync_revision_stmt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- `changed_rows` is supplied by each trigger's REFERENCING clause below:
    -- the new rows for insert/update, the old rows for delete. A statement
    -- touching several workspaces (never emitted by this client, but legal)
    -- bumps each of them exactly once.
    insert into public.workspace_sync_state (workspace_id, revision, updated_at, updated_by)
    select workspace_id, 1, now(), auth.uid()
    from changed_rows
    where workspace_id is not null
    group by workspace_id
    on conflict (workspace_id) do update
    set revision = public.workspace_sync_state.revision + 1,
        updated_at = now(),
        updated_by = auth.uid();

    return null;
end;
$$;

-- Retire the per-row triggers from 0017.
drop trigger if exists canvas_nodes_bump_workspace_revision on public.canvas_nodes;
drop trigger if exists canvas_edges_bump_workspace_revision on public.canvas_edges;

-- Transition tables are per-operation, so insert/update/delete each need their
-- own trigger; a single `after insert or update or delete` statement trigger
-- cannot name both NEW TABLE and OLD TABLE.
drop trigger if exists canvas_nodes_bump_revision_insert on public.canvas_nodes;
create trigger canvas_nodes_bump_revision_insert
    after insert on public.canvas_nodes
    referencing new table as changed_rows
    for each statement execute function public.bump_workspace_sync_revision_stmt();

drop trigger if exists canvas_nodes_bump_revision_update on public.canvas_nodes;
create trigger canvas_nodes_bump_revision_update
    after update on public.canvas_nodes
    referencing new table as changed_rows
    for each statement execute function public.bump_workspace_sync_revision_stmt();

drop trigger if exists canvas_nodes_bump_revision_delete on public.canvas_nodes;
create trigger canvas_nodes_bump_revision_delete
    after delete on public.canvas_nodes
    referencing old table as changed_rows
    for each statement execute function public.bump_workspace_sync_revision_stmt();

drop trigger if exists canvas_edges_bump_revision_insert on public.canvas_edges;
create trigger canvas_edges_bump_revision_insert
    after insert on public.canvas_edges
    referencing new table as changed_rows
    for each statement execute function public.bump_workspace_sync_revision_stmt();

drop trigger if exists canvas_edges_bump_revision_update on public.canvas_edges;
create trigger canvas_edges_bump_revision_update
    after update on public.canvas_edges
    referencing new table as changed_rows
    for each statement execute function public.bump_workspace_sync_revision_stmt();

drop trigger if exists canvas_edges_bump_revision_delete on public.canvas_edges;
create trigger canvas_edges_bump_revision_delete
    after delete on public.canvas_edges
    referencing old table as changed_rows
    for each statement execute function public.bump_workspace_sync_revision_stmt();

-- The per-row function is now unreferenced. Dropping it keeps a later migration
-- from reattaching the behaviour this one exists to remove.
drop function if exists public.bump_workspace_sync_revision();
