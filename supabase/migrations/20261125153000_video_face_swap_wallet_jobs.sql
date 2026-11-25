-- Durable jobs for wallet-billed PiAPI video face swaps.
create table if not exists public.mh_video_face_swap_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.mh_projects(id) on delete cascade,
  source_image_path text not null,
  target_video_path text not null,
  duration_seconds numeric(10,3) not null check (duration_seconds > 0 and duration_seconds <= 600),
  billing_units integer not null check (billing_units > 0),
  coin_cost bigint not null check (coin_cost > 0),
  wallet_reference text not null unique,
  piapi_task_id text unique,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  output_storage_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mh_video_face_swap_jobs_user_created_idx
  on public.mh_video_face_swap_jobs(user_id, created_at desc);
create index if not exists mh_video_face_swap_jobs_status_idx
  on public.mh_video_face_swap_jobs(status, updated_at);
alter table public.mh_video_face_swap_jobs enable row level security;
drop policy if exists "Users can view their own video face swap jobs" on public.mh_video_face_swap_jobs;
create policy "Users can view their own video face swap jobs"
  on public.mh_video_face_swap_jobs for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.mh_video_face_swap_jobs from anon, authenticated;
grant select on public.mh_video_face_swap_jobs to authenticated;
