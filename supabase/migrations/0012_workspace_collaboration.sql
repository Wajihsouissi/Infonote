-- ============================================================================
-- Workspace collaboration: invitations, memberships, and shared canvas access.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.workspace_members (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    user_id      uuid not null references auth.users(id) on delete cascade,
    role         text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
    invited_by   uuid references auth.users(id) on delete set null,
    created_at   timestamptz not null default now(),
    primary key (workspace_id, user_id)
);

alter table public.workspace_members
    add column if not exists role text not null default 'editor',
    add column if not exists invited_by uuid references auth.users(id) on delete set null,
    add column if not exists created_at timestamptz not null default now();

create index if not exists workspace_members_user_idx
    on public.workspace_members(user_id);

create unique index if not exists workspace_members_workspace_user_uidx
    on public.workspace_members(workspace_id, user_id);

create table if not exists public.workspace_invitations (
    id            uuid primary key default gen_random_uuid(),
    workspace_id  uuid not null references public.workspaces(id) on delete cascade,
    invited_email citext not null,
    invited_by    uuid not null references auth.users(id) on delete cascade,
    role          text not null default 'editor' check (role in ('editor', 'viewer')),
    status        text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
    created_at    timestamptz not null default now(),
    accepted_at   timestamptz,
    expires_at    timestamptz not null default (now() + interval '14 days')
);

alter table public.workspace_invitations
    add column if not exists invited_email citext,
    add column if not exists invited_by uuid references auth.users(id) on delete cascade,
    add column if not exists role text not null default 'editor',
    add column if not exists status text not null default 'pending',
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists accepted_at timestamptz,
    add column if not exists expires_at timestamptz not null default (now() + interval '14 days');

create index if not exists workspace_invitations_workspace_idx
    on public.workspace_invitations(workspace_id);

create index if not exists workspace_invitations_email_status_idx
    on public.workspace_invitations(lower(invited_email::text), status);

create unique index if not exists workspace_invitations_pending_unique_idx
    on public.workspace_invitations(workspace_id, lower(invited_email::text))
    where status = 'pending';

insert into public.workspace_members (workspace_id, user_id, role, invited_by)
select id, owner_id, 'owner', owner_id
from public.workspaces
on conflict (workspace_id, user_id) do update
set role = 'owner';

create or replace function public.handle_workspace_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (new.id, new.owner_id, 'owner', new.owner_id)
    on conflict (workspace_id, user_id) do update
    set role = 'owner';

    return new;
end;
$$;

drop trigger if exists on_workspace_created_owner_member on public.workspaces;
create trigger on_workspace_created_owner_member
    after insert on public.workspaces
    for each row
    execute function public.handle_workspace_owner_member();

create or replace function public.workspace_owner_id(_workspace_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
    select owner_id
    from public.workspaces
    where id = _workspace_id;
$$;

create or replace function public.is_workspace_member(_workspace_id uuid, _user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from public.workspaces w
        where w.id = _workspace_id
          and w.owner_id = _user_id
    )
    or exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = _workspace_id
          and wm.user_id = _user_id
    );
$$;

create or replace function public.can_read_workspace_profile(_profile_id uuid, _reader_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select _profile_id = _reader_id
    or exists (
        select 1
        from public.workspaces w
        where w.owner_id = _profile_id
          and public.is_workspace_member(w.id, _reader_id)
    )
    or exists (
        select 1
        from public.workspace_members target_member
        join public.workspace_members reader_member
          on reader_member.workspace_id = target_member.workspace_id
        where target_member.user_id = _profile_id
          and reader_member.user_id = _reader_id
    );
$$;

create or replace function public.create_workspace_invitation(
    _workspace_id uuid,
    _email text,
    _role text default 'editor'
)
returns public.workspace_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
    clean_email citext := lower(trim(_email))::citext;
    invite_row public.workspace_invitations;
begin
    if auth.uid() is null then
        raise exception 'User not authenticated';
    end if;

    if clean_email is null or clean_email::text = '' or position('@' in clean_email::text) = 0 then
        raise exception 'A valid email address is required';
    end if;

    if _role not in ('editor', 'viewer') then
        raise exception 'Invalid workspace role';
    end if;

    if not exists (
        select 1
        from public.workspaces
        where id = _workspace_id
          and owner_id = auth.uid()
    ) then
        raise exception 'Only the workspace owner can invite collaborators';
    end if;

    update public.workspace_invitations
    set status = 'revoked'
    where workspace_id = _workspace_id
      and lower(invited_email::text) = lower(clean_email::text)
      and status = 'pending';

    insert into public.workspace_invitations (
        workspace_id,
        invited_email,
        invited_by,
        role
    )
    values (
        _workspace_id,
        clean_email,
        auth.uid(),
        _role
    )
    returning * into invite_row;

    return invite_row;
end;
$$;

create or replace function public.accept_workspace_invitation(_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    invite_row public.workspace_invitations;
    current_email text;
begin
    if auth.uid() is null then
        raise exception 'User not authenticated';
    end if;

    select coalesce(u.email, up.email)
    into current_email
    from auth.users u
    left join public.user_profiles up on up.id = u.id
    where u.id = auth.uid();

    if current_email is null or trim(current_email) = '' then
        raise exception 'Your account email could not be verified';
    end if;

    select *
    into invite_row
    from public.workspace_invitations
    where id = _invitation_id
      and status = 'pending'
      and expires_at > now()
    for update;

    if not found then
        raise exception 'Invitation is not pending or has expired';
    end if;

    if lower(invite_row.invited_email::text) <> lower(current_email) then
        raise exception 'This invitation belongs to a different email address';
    end if;

    insert into public.workspace_members (
        workspace_id,
        user_id,
        role,
        invited_by
    )
    values (
        invite_row.workspace_id,
        auth.uid(),
        invite_row.role,
        invite_row.invited_by
    )
    on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        invited_by = excluded.invited_by;

    update public.workspace_invitations
    set status = 'accepted',
        accepted_at = now()
    where id = invite_row.id;

    return invite_row.workspace_id;
end;
$$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;

drop policy if exists "workspaces owner all" on public.workspaces;
drop policy if exists "workspaces readable by members" on public.workspaces;
drop policy if exists "workspaces insert own" on public.workspaces;
drop policy if exists "workspaces update owner" on public.workspaces;
drop policy if exists "workspaces delete owner" on public.workspaces;

create policy "workspaces readable by members"
    on public.workspaces for select
    using (public.is_workspace_member(id, auth.uid()));

create policy "workspaces insert own"
    on public.workspaces for insert
    with check (owner_id = auth.uid());

create policy "workspaces update owner"
    on public.workspaces for update
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());

create policy "workspaces delete owner"
    on public.workspaces for delete
    using (owner_id = auth.uid());

drop policy if exists "workspace_members readable by members" on public.workspace_members;
drop policy if exists "workspace_members owner manage" on public.workspace_members;

create policy "workspace_members readable by members"
    on public.workspace_members for select
    using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "workspace_members owner manage"
    on public.workspace_members for all
    using (public.workspace_owner_id(workspace_id) = auth.uid())
    with check (public.workspace_owner_id(workspace_id) = auth.uid());

drop policy if exists "workspace_invitations readable by owner or invitee" on public.workspace_invitations;
drop policy if exists "workspace_invitations owner insert" on public.workspace_invitations;
drop policy if exists "workspace_invitations owner update" on public.workspace_invitations;

create policy "workspace_invitations readable by owner or invitee"
    on public.workspace_invitations for select
    using (
        public.workspace_owner_id(workspace_id) = auth.uid()
        or lower(invited_email::text) = lower(coalesce(auth.jwt()->>'email', ''))
    );

create policy "workspace_invitations owner insert"
    on public.workspace_invitations for insert
    with check (public.workspace_owner_id(workspace_id) = auth.uid());

create policy "workspace_invitations owner update"
    on public.workspace_invitations for update
    using (public.workspace_owner_id(workspace_id) = auth.uid())
    with check (public.workspace_owner_id(workspace_id) = auth.uid());

drop policy if exists "canvas_nodes workspace member all" on public.canvas_nodes;
create policy "canvas_nodes workspace member all"
    on public.canvas_nodes for all
    using (
        public.is_workspace_member(workspace_id, auth.uid())
        and user_id = public.workspace_owner_id(workspace_id)
    )
    with check (
        public.is_workspace_member(workspace_id, auth.uid())
        and user_id = public.workspace_owner_id(workspace_id)
    );

drop policy if exists "canvas_edges workspace member all" on public.canvas_edges;
create policy "canvas_edges workspace member all"
    on public.canvas_edges for all
    using (
        public.is_workspace_member(workspace_id, auth.uid())
        and user_id = public.workspace_owner_id(workspace_id)
    )
    with check (
        public.is_workspace_member(workspace_id, auth.uid())
        and user_id = public.workspace_owner_id(workspace_id)
    );

do $$
begin
    if exists (
        select 1
        from pg_publication
        where pubname = 'supabase_realtime'
    ) then
        if not exists (
            select 1 from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = 'canvas_nodes'
        ) then
            alter publication supabase_realtime add table public.canvas_nodes;
        end if;

        if not exists (
            select 1 from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = 'canvas_edges'
        ) then
            alter publication supabase_realtime add table public.canvas_edges;
        end if;
    end if;
end $$;

grant execute on function public.workspace_owner_id(uuid) to authenticated;
grant execute on function public.can_read_workspace_profile(uuid, uuid) to authenticated;
grant execute on function public.create_workspace_invitation(uuid, text, text) to authenticated;
grant execute on function public.accept_workspace_invitation(uuid) to authenticated;
revoke execute on function public.handle_workspace_owner_member() from public;

drop policy if exists "user_profiles workspace collaborators read" on public.user_profiles;
create policy "user_profiles workspace collaborators read"
    on public.user_profiles for select
    using (public.can_read_workspace_profile(id, auth.uid()));
