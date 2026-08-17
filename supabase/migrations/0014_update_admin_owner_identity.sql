-- ============================================================================
-- Point platform ownership at the current owner account.
--
-- This has to be a new migration rather than an edit to 0009. Migrations are
-- applied once and never re-run, so changing the email inside 0009 would only
-- take effect on a database created from scratch: every environment where 0009
-- had already run would keep authorizing the previous address while the client
-- gate in AdminGate.tsx authorized the new one. The client would say yes and
-- the database no — and the previous address would keep real owner rights.
--
-- Keep this the single place the owner email changes. AdminGate.tsx duplicates
-- it for UX only; is_platform_owner() is the enforcement point every admin RPC
-- (0008, 0013) calls.
-- ============================================================================

create or replace function public.is_platform_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from auth.users u
        where u.id = auth.uid()
          and lower(coalesce(u.email, '')) = 'wajih.souissi.ws@gmail.com'
    );
$$;
