-- ============================================================================
-- Harden platform owner checks and protect profile identity fields.
--
-- Previous admin RPCs trusted public.user_profiles.email. Standard users may
-- update parts of their own profile, so owner authorization must use the
-- Supabase Auth identity record instead of mutable profile data.
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
          and lower(coalesce(u.email, '')) = 'mohebawichewi9@gmail.com'
    );
$$;

create or replace function public.prevent_user_profile_identity_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.id is distinct from old.id
        or new.email is distinct from old.email
        or new.created_at is distinct from old.created_at
        or new.account_status is distinct from old.account_status
    then
        raise exception 'protected profile fields cannot be changed from the client'
            using errcode = '42501';
    end if;

    return new;
end;
$$;

drop trigger if exists user_profiles_prevent_identity_update on public.user_profiles;
create trigger user_profiles_prevent_identity_update
    before update on public.user_profiles
    for each row
    execute function public.prevent_user_profile_identity_update();

revoke execute on function public.admin_list_users() from public;
revoke execute on function public.admin_get_analytics() from public;
revoke execute on function public.admin_get_daily_traffic() from public;
revoke execute on function public.admin_delete_user(uuid) from public;

grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_get_analytics() to authenticated;
grant execute on function public.admin_get_daily_traffic() to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
