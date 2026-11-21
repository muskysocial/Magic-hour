-- Magic Hour Site Control Centre configuration, feature catalogue and audit trail.
create table if not exists public.mh_site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.mh_site_features (
  tool_id text primary key,
  name text not null default '',
  description text not null default '',
  enabled boolean not null default true,
  access_tier text not null default 'free' check (access_tier in ('free','pro','restricted')),
  coin_cost integer not null default 0 check (coin_cost >= 0),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.mh_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  actor_email text not null,
  action text not null,
  target text not null default '',
  details text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists mh_admin_audit_log_created_idx on public.mh_admin_audit_log(created_at desc);
alter table public.mh_site_settings enable row level security;
alter table public.mh_site_features enable row level security;
alter table public.mh_admin_audit_log enable row level security;
drop policy if exists "Magic Hour owner reads site settings" on public.mh_site_settings;
create policy "Magic Hour owner reads site settings" on public.mh_site_settings for select to authenticated using (lower(coalesce((select auth.jwt()->>'email'),''))='ugohjeremiah16@gmail.com' and exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.role in ('admin','owner','super_admin')));
drop policy if exists "Magic Hour owner reads site features" on public.mh_site_features;
create policy "Magic Hour owner reads site features" on public.mh_site_features for select to authenticated using (lower(coalesce((select auth.jwt()->>'email'),''))='ugohjeremiah16@gmail.com' and exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.role in ('admin','owner','super_admin')));
drop policy if exists "Magic Hour owner reads audit log" on public.mh_admin_audit_log;
create policy "Magic Hour owner reads audit log" on public.mh_admin_audit_log for select to authenticated using (lower(coalesce((select auth.jwt()->>'email'),''))='ugohjeremiah16@gmail.com' and exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.role in ('admin','owner','super_admin')));
insert into public.mh_site_features(tool_id,name,description,enabled,sort_order) values
('canva','Canva Me','Design and create graphics',true,1),
('headswap','Image HeadSwap','Swap faces in photos',true,2),
('videoswap','Video Face Swap','Swap faces in videos',true,3),
('format','Format','Convert, compress and resize files',true,4),
('social','All Social Media Platform','Manage social media services',true,5),
('shipment-room','Shipment Journey','Create and share animated shipment tracking',true,6)
on conflict(tool_id) do nothing;
