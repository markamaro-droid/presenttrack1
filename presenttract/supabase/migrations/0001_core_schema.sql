-- PresentTract core schema. Apply: `supabase db push` (or paste into the SQL editor).
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_path text,
  baseline_completed_at timestamptz,
  preferences jsonb not null default '{"target_wpm_min":120,"target_wpm_max":160,"long_pause_seconds":2}',
  created_at timestamptz not null default now()
);

create table public.presentations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  original_name text not null,
  mime_type text not null check (mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation')),
  file_size bigint not null check (file_size > 0),
  storage_path text not null unique,
  page_count int,
  created_at timestamptz not null default now()
);
create index on public.presentations (user_id, created_at desc);

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  presentation_id uuid references public.presentations(id) on delete set null, -- null for baseline
  session_type text not null check (session_type in ('baseline','evaluation','practice')),
  status text not null default 'in_progress' check (status in ('in_progress','analyzing','completed','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  elapsed_seconds numeric,
  speech_seconds numeric,
  transcript_path text,
  created_at timestamptz not null default now()
);
create index on public.practice_sessions (user_id, started_at desc);

create table public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.practice_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  words_spoken int not null,
  wpm numeric,            -- words / speech-active minutes
  overall_wpm numeric,    -- words / total elapsed minutes
  pace_label text check (pace_label in ('slow','comfortable','fast','no_speech')),
  filler_counts jsonb not null default '{}',
  filler_total int not null default 0,
  long_pause_count int not null default 0,
  long_pause_seconds numeric not null default 0,
  long_pause_segments jsonb not null default '[]',
  accuracy_note text,
  created_at timestamptz not null default now()
);
create index on public.performance_metrics (user_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null, title text not null, body text,
  read_at timestamptz, created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

create table public.companion_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.companion_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.companion_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null, created_at timestamptz not null default now()
);

-- ---------- RLS: owner-only everywhere ----------
alter table public.profiles enable row level security;
alter table public.presentations enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.performance_metrics enable row level security;
alter table public.notifications enable row level security;
alter table public.companion_conversations enable row level security;
alter table public.companion_messages enable row level security;

create policy profiles_select on public.profiles for select using (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- baseline_completed_at is server-authoritative: users cannot write it directly.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, avatar_path, preferences) on public.profiles to authenticated;

create policy presentations_all on public.presentations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sessions_all on public.practice_sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy metrics_select on public.performance_metrics for select using (user_id = auth.uid());
create policy metrics_insert on public.performance_metrics for insert with check (
  user_id = auth.uid() and exists (select 1 from public.practice_sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy notif_all on public.notifications for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy conv_all on public.companion_conversations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy msg_all on public.companion_messages for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (
    select 1 from public.companion_conversations c where c.id = conversation_id and c.user_id = auth.uid()));

-- ---------- New-user profile ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Baseline completion (only path to set baseline_completed_at) ----------
create or replace function public.complete_baseline(p_session_id uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare ts timestamptz := now();
begin
  if not exists (
    select 1 from practice_sessions s join performance_metrics m on m.session_id = s.id
    where s.id = p_session_id and s.user_id = auth.uid()
      and s.session_type = 'baseline' and s.status = 'completed'
  ) then raise exception 'No completed baseline session with metrics for this user'; end if;
  update profiles set baseline_completed_at = ts where id = auth.uid() and baseline_completed_at is null;
  return ts;
end $$;
revoke all on function public.complete_baseline(uuid) from public;
grant execute on function public.complete_baseline(uuid) to authenticated;

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('presentations','presentations',false,26214400,
   array['application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation']),
  ('practice-media','practice-media',false,52428800,array['audio/webm','audio/ogg','audio/mp4','audio/wav','audio/mpeg'])
on conflict (id) do nothing;

create policy "own files read" on storage.objects for select to authenticated
  using (bucket_id in ('presentations','practice-media') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('presentations','practice-media') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files update" on storage.objects for update to authenticated
  using (bucket_id in ('presentations','practice-media') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects for delete to authenticated
  using (bucket_id in ('presentations','practice-media') and (storage.foldername(name))[1] = auth.uid()::text);
