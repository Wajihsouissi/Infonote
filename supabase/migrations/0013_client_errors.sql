-- ============================================================================
-- Client error telemetry (beta observability).
--
-- Browsers report uncaught errors, unhandled promise rejections, and React
-- error-boundary catches here so beta crashes are visible without relying on
-- user reports. Insert-only for clients (anon + authenticated); reads go
-- through an owner-gated RPC — same pattern as site_visits (0004) and
-- is_platform_owner (0009).
-- ============================================================================

create table if not exists public.client_errors (
    id          uuid        primary key default gen_random_uuid(),
    occurred_at timestamptz not null default now(),
    user_id     uuid        null default auth.uid(),
    source      text        not null check (source in ('window-error', 'unhandled-rejection', 'error-boundary')),
    message     text        not null check (char_length(message) <= 2000),
    stack       text        null check (stack is null or char_length(stack) <= 8000),
    url         text        null check (url is null or char_length(url) <= 500),
    user_agent  text        null check (user_agent is null or char_length(user_agent) <= 400)
);

create index if not exists client_errors_time_idx on public.client_errors(occurred_at desc);

alter table public.client_errors enable row level security;

-- Insert-only from browsers. No client reads, updates, or deletes.
drop policy if exists "client_errors insert" on public.client_errors;
create policy "client_errors insert"
    on public.client_errors for insert
    to anon, authenticated
    with check (user_id is null or user_id = auth.uid());

-- Owner-only read RPC (mirrors the 0008/0009 admin RPC pattern).
drop function if exists public.admin_get_client_errors(int);
create or replace function public.admin_get_client_errors(_limit int default 200)
returns setof public.client_errors
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_platform_owner() then
        raise exception 'admin access denied' using errcode = '42501';
    end if;

    return query
    select *
    from public.client_errors
    order by occurred_at desc
    limit least(greatest(coalesce(_limit, 200), 1), 1000);
end;
$$;

revoke execute on function public.admin_get_client_errors(int) from public;
grant execute on function public.admin_get_client_errors(int) to authenticated;
