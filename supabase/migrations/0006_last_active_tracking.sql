-- ============================================================================
-- Last Active Tracking
-- Adds last_active_at column to user_profiles for inactivity monitoring.
-- Updates admin_list_users RPC to include the new column.
-- ============================================================================

-- Add last_active_at column
alter table public.user_profiles 
    add column if not exists last_active_at timestamptz;

-- Drop existing function first (return type changed — PG disallows in-place change)
drop function if exists public.admin_list_users();

-- Update the admin_list_users function to include last_active_at
create or replace function public.admin_list_users()
returns table (
    id uuid,
    email text,
    display_name text,
    created_at timestamptz,
    account_status text,
    last_active_at timestamptz
)
language sql
security definer
set search_path = public
as $$
    select
        p.id,
        p.email,
        p.display_name,
        p.created_at,
        p.account_status,
        p.last_active_at
    from user_profiles p
    order by p.created_at desc;
$$;
