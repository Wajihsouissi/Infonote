-- ============================================================================
-- Real duplicate-email validation for client signup flows.
--
-- Supabase Auth can intentionally return a non-specific signup response for an
-- existing address. This SECURITY DEFINER helper gives the UI the explicit
-- product behavior Infonote wants: block duplicate signup attempts before
-- redirecting or showing success.
-- ============================================================================

create or replace function public.email_is_registered(_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from auth.users u
        where lower(coalesce(u.email, '')) = lower(trim(coalesce(_email, '')))
    );
$$;

revoke execute on function public.email_is_registered(text) from public;
grant execute on function public.email_is_registered(text) to anon;
grant execute on function public.email_is_registered(text) to authenticated;
