-- PresentTrack: Initial Presentation Assessment (backend schema)
-- Idempotent. Paste into Supabase SQL Editor (or `supabase db push`). Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. user_data columns + one-time backfill (existing accounts are exempt)
-- ---------------------------------------------------------------------------
alter table public.user_data add column if not exists created_at timestamptz default now();

do $mig$
begin
  -- Backfill runs ONLY the first time (when the flag column does not exist yet),
  -- so re-running the migration never flips users who signed up afterwards.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_data'
      and column_name = 'initial_assessment_completed'
  ) then
    alter table public.user_data
      add column initial_assessment_completed boolean not null default false,
      add column initial_assessment_presentation_id uuid null,
      add column initial_assessment_completed_at timestamptz null;

    -- Accounts that exist but have no user_data row yet.
    insert into public.user_data (user_id, onboarded, initial_assessment_completed, initial_assessment_completed_at)
    select u.id, false, true, now()
    from auth.users u
    where not exists (select 1 from public.user_data d where d.user_id = u.id);

    -- Every row that existed before this migration.
    update public.user_data
       set initial_assessment_completed = true,
           initial_assessment_completed_at = coalesce(initial_assessment_completed_at, now());
  end if;
end
$mig$;

-- Safety net if a partial earlier run added only some of the columns.
alter table public.user_data add column if not exists initial_assessment_completed boolean not null default false;
alter table public.user_data add column if not exists initial_assessment_presentation_id uuid null;
alter table public.user_data add column if not exists initial_assessment_completed_at timestamptz null;

-- ---------------------------------------------------------------------------
-- 2. New accounts always get a persistent user_data row (assessment pending)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user_data()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_data (user_id, onboarded, initial_assessment_completed)
  values (new.id, false, false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_user_data on auth.users;
create trigger on_auth_user_created_user_data
  after insert on auth.users
  for each row execute function public.handle_new_user_data();

-- ---------------------------------------------------------------------------
-- 3. Clients may never write the completion fields (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.protect_assessment_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      new.initial_assessment_completed := false;
      new.initial_assessment_presentation_id := null;
      new.initial_assessment_completed_at := null;
      new.created_at := now();
    else
      new.initial_assessment_completed := old.initial_assessment_completed;
      new.initial_assessment_presentation_id := old.initial_assessment_presentation_id;
      new.initial_assessment_completed_at := old.initial_assessment_completed_at;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_assessment_fields on public.user_data;
create trigger protect_assessment_fields
  before insert or update on public.user_data
  for each row execute function public.protect_assessment_fields();

-- ---------------------------------------------------------------------------
-- 4. initial_assessments (one row per user; PK prevents duplicates)
-- ---------------------------------------------------------------------------
create table if not exists public.initial_assessments (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  id              uuid not null default gen_random_uuid() unique,
  status          text not null default 'generating'
                  check (status in ('generating','ready','in_progress','completed','failed')),
  title           text,
  slides          jsonb,   -- visible slide content only
  guidelines      jsonb,   -- speaker / assessment instructions, kept separate
  file_path       text,
  file_name       text,
  results         jsonb,
  classification  text,
  quality         text,
  error           text,
  gen_attempts    int not null default 0,
  submit_attempts int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);

alter table public.initial_assessments enable row level security;

drop policy if exists "read own assessment" on public.initial_assessments;
create policy "read own assessment" on public.initial_assessments
  for select to authenticated
  using ((select auth.uid()) = user_id);
-- No insert/update/delete policies: only the service role (edge functions) writes.

-- ---------------------------------------------------------------------------
-- 5. ai_usage (rate limiting; service role only)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  created_at timestamptz not null default now()
);
alter table public.ai_usage enable row level security;
create index if not exists ai_usage_user_kind_created_idx on public.ai_usage (user_id, kind, created_at);

-- ---------------------------------------------------------------------------
-- 6. begin_assessment_generation
-- ---------------------------------------------------------------------------
create or replace function public.begin_assessment_generation(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed boolean;
  v_row public.initial_assessments%rowtype;
begin
  -- Exempt (already completed) accounts with no assessment row: nothing to do.
  -- This check MUST come before any insert.
  select d.initial_assessment_completed into v_completed
    from public.user_data d where d.user_id = p_user;

  if coalesce(v_completed, false)
     and not exists (select 1 from public.initial_assessments a where a.user_id = p_user) then
    return jsonb_build_object('action', 'not_required');
  end if;

  insert into public.initial_assessments (user_id, status, gen_attempts, updated_at)
  values (p_user, 'generating', 0, now() - interval '1 day')  -- born stale so the first call generates
  on conflict (user_id) do nothing;

  select * into v_row from public.initial_assessments where user_id = p_user for update;

  if v_row.status in ('ready', 'in_progress', 'completed') then
    return jsonb_build_object('action', 'exists');
  end if;

  if v_row.status = 'generating' and v_row.updated_at > now() - interval '2 minutes' then
    return jsonb_build_object('action', 'busy');
  end if;

  update public.initial_assessments
     set status = 'generating', error = null,
         gen_attempts = gen_attempts + 1, updated_at = now()
   where user_id = p_user;

  return jsonb_build_object('action', 'generate');
end;
$$;

revoke all on function public.begin_assessment_generation(uuid) from public, anon, authenticated;
grant execute on function public.begin_assessment_generation(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. complete_initial_assessment (atomic)
-- ---------------------------------------------------------------------------
create or replace function public.complete_initial_assessment(
  p_user uuid, p_results jsonb, p_classification text, p_quality text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.initial_assessments
     set status = 'completed',
         results = p_results,
         classification = p_classification,
         quality = p_quality,
         completed_at = now(),
         updated_at = now(),
         submit_attempts = submit_attempts + 1
   where user_id = p_user
     and status in ('ready', 'in_progress', 'completed')
  returning id into v_id;

  if v_id is null then
    raise exception 'assessment_not_found_or_invalid_state';
  end if;

  insert into public.user_data (user_id, onboarded, initial_assessment_completed,
                                initial_assessment_presentation_id, initial_assessment_completed_at)
  values (p_user, false, true, v_id, now())
  on conflict (user_id) do update
    set initial_assessment_completed = true,
        initial_assessment_presentation_id = v_id,
        initial_assessment_completed_at = now();

  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.complete_initial_assessment(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.complete_initial_assessment(uuid, jsonb, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Private storage bucket + per-user folder policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('presentations', 'presentations', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "presentations select own" on storage.objects;
create policy "presentations select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'presentations' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Clients cannot write into <uid>/assessment/ (service role manages that file).
drop policy if exists "presentations insert own" on storage.objects;
create policy "presentations insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'presentations'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((storage.foldername(name))[2], '') <> 'assessment');

drop policy if exists "presentations update own" on storage.objects;
create policy "presentations update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'presentations'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((storage.foldername(name))[2], '') <> 'assessment')
  with check (bucket_id = 'presentations'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((storage.foldername(name))[2], '') <> 'assessment');

drop policy if exists "presentations delete own" on storage.objects;
create policy "presentations delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'presentations'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((storage.foldername(name))[2], '') <> 'assessment');
