-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- One row per user holding their app state (presentations, sessions, notifications, goals) as JSON.

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  onboarded  boolean     not null default false,
  data       jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

-- Each signed-in user can only touch their own row.
create policy "read own data"   on public.user_data for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "insert own data" on public.user_data for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "update own data" on public.user_data for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own data" on public.user_data for delete to authenticated
  using ((select auth.uid()) = user_id);
