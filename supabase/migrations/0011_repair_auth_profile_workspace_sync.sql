-- ============================================================================
-- Repair auth/profile/workspace synchronization.
--
-- Fixes existing projects where public.workspaces.owner_id was created against
-- a legacy public.profiles(id) table while the live app signs users in through
-- auth.users and mirrors identity into public.user_profiles.
-- ============================================================================

create extension if not exists pgcrypto;

alter table public.user_profiles
    add column if not exists display_name text,
    add column if not exists account_status text not null default 'active',
    add column if not exists last_active_at timestamptz;

create or replace function public.ensure_legacy_profile_for_auth_user(_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    insert_columns text := 'id';
    select_values text := 'u.id';
begin
    if to_regclass('public.profiles') is null then
        return;
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'profiles'
          and column_name = 'email'
    ) then
        insert_columns := insert_columns || ', email';
        select_values := select_values || ', coalesce(u.email, '''')';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'profiles'
          and column_name = 'created_at'
    ) then
        insert_columns := insert_columns || ', created_at';
        select_values := select_values || ', coalesce(u.created_at, now())';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'profiles'
          and column_name = 'updated_at'
    ) then
        insert_columns := insert_columns || ', updated_at';
        select_values := select_values || ', now()';
    end if;

    execute format(
        'insert into public.profiles (%s)
         select %s
         from auth.users u
         where u.id = $1
         on conflict (id) do nothing',
        insert_columns,
        select_values
    )
    using _user_id;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.user_profiles (
        id,
        email,
        display_name,
        account_status,
        last_active_at
    )
    values (
        new.id,
        coalesce(new.email, ''),
        coalesce(
            new.raw_user_meta_data->>'display_name',
            new.raw_user_meta_data->>'full_name',
            split_part(coalesce(new.email, ''), '@', 1),
            'User'
        ),
        'active',
        now()
    )
    on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.user_profiles.display_name, excluded.display_name),
        account_status = coalesce(public.user_profiles.account_status, excluded.account_status),
        last_active_at = coalesce(public.user_profiles.last_active_at, excluded.last_active_at);

    perform public.ensure_legacy_profile_for_auth_user(new.id);
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute function public.handle_new_user();

insert into public.user_profiles (
    id,
    email,
    display_name,
    account_status,
    last_active_at
)
select
    u.id,
    coalesce(u.email, ''),
    coalesce(
        u.raw_user_meta_data->>'display_name',
        u.raw_user_meta_data->>'full_name',
        split_part(coalesce(u.email, ''), '@', 1),
        'User'
    ),
    'active',
    now()
from auth.users u
on conflict (id) do update
set email = excluded.email,
    display_name = coalesce(public.user_profiles.display_name, excluded.display_name),
    account_status = coalesce(public.user_profiles.account_status, excluded.account_status),
    last_active_at = coalesce(public.user_profiles.last_active_at, excluded.last_active_at);

do $$
declare
    auth_user record;
begin
    for auth_user in select id from auth.users loop
        perform public.ensure_legacy_profile_for_auth_user(auth_user.id);
    end loop;
end $$;

create table if not exists public.workspaces (
    id          uuid primary key default gen_random_uuid(),
    owner_id    uuid not null references auth.users(id) on delete cascade,
    name        text not null default 'My Workspace',
    created_at  timestamptz not null default now()
);

do $$
declare
    fk record;
begin
    if to_regclass('public.workspaces') is null then
        return;
    end if;

    if to_regclass('public.profiles') is not null then
        for fk in
            select c.conname
            from pg_constraint c
            where c.conrelid = 'public.workspaces'::regclass
              and c.contype = 'f'
              and c.confrelid = 'public.profiles'::regclass
              and c.conkey = array[
                  (
                      select a.attnum
                      from pg_attribute a
                      where a.attrelid = 'public.workspaces'::regclass
                        and a.attname = 'owner_id'
                  )
              ]::smallint[]
        loop
            execute format('alter table public.workspaces drop constraint %I', fk.conname);
        end loop;
    end if;

    if not exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.workspaces'::regclass
          and c.contype = 'f'
          and c.confrelid = 'auth.users'::regclass
          and c.conkey = array[
              (
                  select a.attnum
                  from pg_attribute a
                  where a.attrelid = 'public.workspaces'::regclass
                    and a.attname = 'owner_id'
              )
          ]::smallint[]
    ) then
        alter table public.workspaces
            add constraint workspaces_owner_id_fkey
            foreign key (owner_id) references auth.users(id) on delete cascade;
    end if;
end $$;

create index if not exists workspaces_owner_idx on public.workspaces(owner_id);

alter table public.workspaces enable row level security;

drop policy if exists "workspaces owner all" on public.workspaces;
create policy "workspaces owner all"
    on public.workspaces for all
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());

create or replace function public.is_workspace_member(_workspace_id uuid, _user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.workspaces
        where id = _workspace_id
          and owner_id = _user_id
    );
$$;

insert into public.workspaces (owner_id, name)
select u.id, 'My Workspace'
from auth.users u
where not exists (
    select 1
    from public.workspaces w
    where w.owner_id = u.id
);

revoke execute on function public.ensure_legacy_profile_for_auth_user(uuid) from public;
grant execute on function public.ensure_legacy_profile_for_auth_user(uuid) to authenticated;
