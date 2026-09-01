-- ============================================================================
-- Recoverable canvas versions
--
-- The live canvas rows remain the fast, collaborative working copy. This table
-- stores intentionally-created restore points and one safety copy per day.
-- ============================================================================

create table if not exists public.canvas_versions (
    id          uuid        primary key default gen_random_uuid(),
    workspace_id uuid       not null references public.workspaces(id) on delete cascade,
    created_by  uuid        not null references public.user_profiles(id) on delete cascade,
    kind        text        not null check (kind in ('manual', 'daily')),
    label       text        null check (label is null or char_length(label) <= 120),
    daily_key   date        null,
    nodes       jsonb       not null,
    edges       jsonb       not null,
    node_count  integer     not null default 0 check (node_count >= 0),
    edge_count  integer     not null default 0 check (edge_count >= 0),
    created_at  timestamptz not null default now(),
    constraint canvas_versions_daily_key check (
        (kind = 'daily' and daily_key is not null)
        or (kind = 'manual' and daily_key is null)
    ),
    constraint canvas_versions_one_daily_copy unique (workspace_id, kind, daily_key)
);

create index if not exists canvas_versions_workspace_created_idx
    on public.canvas_versions(workspace_id, created_at desc);

alter table public.canvas_versions enable row level security;

drop policy if exists "canvas versions readable by workspace members" on public.canvas_versions;
create policy "canvas versions readable by workspace members"
    on public.canvas_versions for select
    using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "canvas versions creatable by workspace members" on public.canvas_versions;
create policy "canvas versions creatable by workspace members"
    on public.canvas_versions for insert
    with check (
        created_by = auth.uid()
        and public.is_workspace_member(workspace_id, auth.uid())
    );

-- Keep version history useful without allowing background sync to grow the
-- database forever: twenty explicit milestones and fourteen daily safety copies.
create or replace function public.prune_canvas_versions(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_workspace_member(p_workspace_id, auth.uid()) then
        raise exception 'Not allowed to manage versions for this workspace';
    end if;

    delete from public.canvas_versions
    where id in (
        select id
        from public.canvas_versions
        where workspace_id = p_workspace_id and kind = 'manual'
        order by created_at desc
        offset 20
    )
    or id in (
        select id
        from public.canvas_versions
        where workspace_id = p_workspace_id and kind = 'daily'
        order by created_at desc
        offset 14
    );
end;
$$;

grant execute on function public.prune_canvas_versions(uuid) to authenticated;
