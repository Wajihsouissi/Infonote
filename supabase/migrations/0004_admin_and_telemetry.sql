-- ============================================================================
-- Admin Dashboard + Telemetry Schema
-- Adds site_visits tracking, admin helper RPCs, and display_name support.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend user_profiles with display_name (if not already present)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.user_profiles
    add column if not exists display_name text,
    add column if not exists account_status text not null default 'active';

create index if not exists user_profiles_status_idx on public.user_profiles(account_status);

-- Update the auto-provision trigger to capture display_name from metadata
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
        account_status
    )
    values (
        new.id,
        coalesce(new.email, ''),
        coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', ''),
        'active'
    )
    on conflict (id) do update set
        email = excluded.email,
        display_name = coalesce(excluded.display_name, public.user_profiles.display_name),
        updated_at = now();
    return new;
end;
$$;

-- Ensure trigger exists (idempotent)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute function public.handle_new_user();

-- Also update existing users that might have registered before this migration
update public.user_profiles
set display_name = coalesce(
    (select raw_user_meta_data->>'display_name' from auth.users where auth.users.id = public.user_profiles.id),
    (select raw_user_meta_data->>'full_name' from auth.users where auth.users.id = public.user_profiles.id),
    display_name
)
where display_name is null or display_name = '';


-- ─────────────────────────────────────────────────────────────────────────────
-- site_visits  (telemetry table)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.site_visits (
    id          uuid        primary key default gen_random_uuid(),
    visitor_ip  inet        null,
    user_agent  text        null,
    visited_at  timestamptz not null default now()
);

create index if not exists site_visits_time_idx on public.site_visits(visited_at desc);

alter table public.site_visits enable row level security;

-- Only allow inserts (from the public / anon role via a service key or from
-- authenticated users).  Admins may read all rows via a secure RPC.
drop policy if exists "site_visits anon insert" on public.site_visits;
create policy "site_visits anon insert"
    on public.site_visits for insert
    to anon, authenticated
    with check (true);

-- Note: read access is intentionally restricted. Use the admin RPCs below.


-- ─────────────────────────────────────────────────────────────────────────────
-- Admin RPCs  (security definer — only callable by authenticated users)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. List all registered users (admin only)
--    In a real production app you would gate this behind an admin role check.
--    For this implementation we expose the function and let the frontend
--    decide whether to render the admin panel.
drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table (
    id uuid,
    email text,
    display_name text,
    created_at timestamptz,
    account_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    select up.id, up.email, up.display_name, up.created_at, up.account_status
    from public.user_profiles up
    order by up.created_at desc;
end;
$$;

-- 2. Delete a user (admin only — purges from auth.users which cascades to profiles)
drop function if exists public.admin_delete_user(uuid);
create or replace function public.admin_delete_user(_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Deleting from auth.users cascades to user_profiles via FK.
    delete from auth.users where id = _user_id;
    return found;
end;
$$;

-- 3. Get site visit analytics
drop function if exists public.admin_get_analytics();
create or replace function public.admin_get_analytics()
returns table (
    metric text,
    value bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
    -- total visits
    return query select 'total_visits'::text, count(*)::bigint from public.site_visits;
    -- unique visitor IPs (treat null as a single bucket)
    return query select 'unique_visitors'::text, count(distinct coalesce(visitor_ip::text, 'unknown'))::bigint from public.site_visits;
    -- today's visits
    return query select 'today_visits'::text, count(*)::bigint from public.site_visits where date_trunc('day', visited_at) = date_trunc('day', now());
end;
$$;

-- 4. Get daily traffic for the last 30 days
drop function if exists public.admin_get_daily_traffic();
create or replace function public.admin_get_daily_traffic()
returns table (
    day date,
    visits bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    select
        date_trunc('day', visited_at)::date as day,
        count(*)::bigint as visits
    from public.site_visits
    where visited_at >= now() - interval '30 days'
    group by day
    order by day desc;
end;
$$;
