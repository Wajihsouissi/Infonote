-- ============================================================================
-- Owner-only admin RPC access.
--
-- The hidden /wajihadmin route checks the active Supabase profile client-side
-- for UX, but the RPCs also enforce the same owner email inside PostgreSQL so
-- standard authenticated users cannot call admin functions directly.
-- ============================================================================

create or replace function public.is_platform_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.user_profiles p
        where p.id = auth.uid()
          and lower(p.email) = 'mohebawichewi9@gmail.com'
    );
$$;

drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table (
    id uuid,
    email text,
    display_name text,
    created_at timestamptz,
    account_status text,
    last_active_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_platform_owner() then
        raise exception 'admin access denied' using errcode = '42501';
    end if;

    return query
    select
        p.id,
        p.email,
        p.display_name,
        p.created_at,
        p.account_status,
        p.last_active_at
    from public.user_profiles p
    order by p.created_at desc;
end;
$$;

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
    if not public.is_platform_owner() then
        raise exception 'admin access denied' using errcode = '42501';
    end if;

    return query select 'total_visits'::text, count(*)::bigint from public.site_visits;
    return query select 'unique_visitors'::text, count(distinct coalesce(visitor_ip::text, 'unknown'))::bigint from public.site_visits;
    return query select 'today_visits'::text, count(*)::bigint from public.site_visits where date_trunc('day', visited_at) = date_trunc('day', now());
end;
$$;

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
    if not public.is_platform_owner() then
        raise exception 'admin access denied' using errcode = '42501';
    end if;

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

drop function if exists public.admin_delete_user(uuid);
create or replace function public.admin_delete_user(_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_platform_owner() then
        raise exception 'admin access denied' using errcode = '42501';
    end if;

    delete from auth.users where id = _user_id;
    return found;
end;
$$;
