-- Campaigns are private admin-managed records. Public reads are served only
-- through campaign-service, which signs short-lived URLs for active assets.
create table if not exists public.mh_site_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  message text not null default '' check (char_length(message) <= 500),
  asset_id uuid not null references public.mh_assets(id) on delete restrict,
  link_url text,
  placements text[] not null default array['welcome','homepage']::text[],
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  priority integer not null default 0 check (priority between 0 and 1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mh_site_campaigns_valid_placements check (
    cardinality(placements) > 0 and placements <@ array['welcome','homepage']::text[]
  ),
  constraint mh_site_campaigns_valid_window check (ends_at is null or ends_at > starts_at)
);
create index if not exists mh_site_campaigns_public_idx
  on public.mh_site_campaigns(status, starts_at, ends_at, priority desc);
create index if not exists mh_site_campaigns_asset_idx
  on public.mh_site_campaigns(asset_id);
alter table public.mh_site_campaigns enable row level security;
drop policy if exists "Admins can read Magic Hour campaigns" on public.mh_site_campaigns;
create policy "Admins can read Magic Hour campaigns"
  on public.mh_site_campaigns for select to authenticated
  using (exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
      and au.role in ('admin','owner','super_admin')
  ));
drop policy if exists "Admins can create Magic Hour campaigns" on public.mh_site_campaigns;
create policy "Admins can create Magic Hour campaigns"
  on public.mh_site_campaigns for insert to authenticated
  with check (
    created_by = (select auth.uid()) and exists (
      select 1 from public.admin_users au
      where au.user_id = (select auth.uid())
        and au.role in ('admin','owner','super_admin')
    )
  );
drop policy if exists "Admins can update Magic Hour campaigns" on public.mh_site_campaigns;
create policy "Admins can update Magic Hour campaigns"
  on public.mh_site_campaigns for update to authenticated
  using (exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
      and au.role in ('admin','owner','super_admin')
  ))
  with check (exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
      and au.role in ('admin','owner','super_admin')
  ));
drop policy if exists "Admins can delete Magic Hour campaigns" on public.mh_site_campaigns;
create policy "Admins can delete Magic Hour campaigns"
  on public.mh_site_campaigns for delete to authenticated
  using (exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
      and au.role in ('admin','owner','super_admin')
  ));
