-- Crash reports from the beta (src/services/errorReports.ts).
--
-- Run this once, in the new project's SQL editor. It is the only table the
-- beta uses: sign-in needs none, and nothing else is written to the database.
--
-- Anyone using the app may add a row, nobody may read one back. Reports are
-- read in the Supabase dashboard (Table editor → client_errors), which uses a
-- service key and is not subject to the policy below.

create table if not exists public.client_errors (
    id          uuid primary key default gen_random_uuid(),
    created_at  timestamptz      not null default now(),
    -- Filled in automatically for a signed-in reporter; null for a guest.
    user_id     uuid             default auth.uid() references auth.users on delete set null,
    -- 'window-error' | 'unhandled-rejection' | 'error-boundary'
    source      text             not null,
    message     text             not null,
    stack       text,
    -- The path only ('/canvas', '/home'): the beta's addresses carry no content.
    url         text,
    user_agent  text
);

-- Newest first is the only way this is ever read.
create index if not exists client_errors_created_at_idx
    on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

-- Insert only. Without a select policy, row-level security denies every read,
-- so one user's crash can never be fetched by another.
drop policy if exists "anyone may report a crash" on public.client_errors;
create policy "anyone may report a crash"
    on public.client_errors
    for insert
    to anon, authenticated
    with check (true);
