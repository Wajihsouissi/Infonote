-- ============================================================================
-- Workspace-scoped binary assets
--
-- Canvas rows carry small `asset:<id>` references. The bytes live in a private
-- Supabase Storage bucket and this manifest supplies metadata + an RLS boundary.
-- ============================================================================

create table if not exists public.workspace_assets (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    id text not null,
    storage_path text not null unique,
    name text not null,
    mime text not null,
    size bigint not null check (size >= 0 and size <= 26214400),
    hash text not null,
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (workspace_id, id)
);

alter table public.workspace_assets enable row level security;

drop policy if exists "workspace assets readable by members" on public.workspace_assets;
create policy "workspace assets readable by members"
    on public.workspace_assets for select
    using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workspace assets insertable by members" on public.workspace_assets;
create policy "workspace assets insertable by members"
    on public.workspace_assets for insert
    with check (
        created_by = auth.uid()
        and public.is_workspace_member(workspace_id, auth.uid())
    );

drop policy if exists "workspace assets updateable by members" on public.workspace_assets;
create policy "workspace assets updateable by members"
    on public.workspace_assets for update
    using (public.is_workspace_member(workspace_id, auth.uid()))
    with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workspace assets deletable by members" on public.workspace_assets;
create policy "workspace assets deletable by members"
    on public.workspace_assets for delete
    using (public.is_workspace_member(workspace_id, auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-assets', 'workspace-assets', false, 26214400)
on conflict (id) do update
set public = false,
    file_size_limit = 26214400;

drop policy if exists "workspace asset objects readable by members" on storage.objects;
create policy "workspace asset objects readable by members"
    on storage.objects for select
    using (
        bucket_id = 'workspace-assets'
        and case
            when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
            else false
        end
    );

drop policy if exists "workspace asset objects insertable by members" on storage.objects;
create policy "workspace asset objects insertable by members"
    on storage.objects for insert
    with check (
        bucket_id = 'workspace-assets'
        and case
            when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
            else false
        end
    );

drop policy if exists "workspace asset objects updateable by members" on storage.objects;
create policy "workspace asset objects updateable by members"
    on storage.objects for update
    using (
        bucket_id = 'workspace-assets'
        and case
            when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
            else false
        end
    )
    with check (
        bucket_id = 'workspace-assets'
        and case
            when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
            else false
        end
    );

drop policy if exists "workspace asset objects deletable by members" on storage.objects;
create policy "workspace asset objects deletable by members"
    on storage.objects for delete
    using (
        bucket_id = 'workspace-assets'
        and case
            when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
            else false
        end
    );
