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

-- Server-only, transaction-safe wallet adjustment. The Edge Function authenticates
-- the owner before invoking this service-role-only RPC.
create or replace function public.mh_admin_adjust_wallet(p_user_id uuid,p_amount bigint,p_description text,p_reference text)
returns bigint language plpgsql security definer set search_path=public as $$
declare next_balance bigint;
begin
  if p_amount = 0 or abs(p_amount) > 100000000 then raise exception 'Invalid adjustment amount'; end if;
  insert into public.mh_wallets(user_id,balance) values(p_user_id,0) on conflict(user_id) do nothing;
  update public.mh_wallets set balance=balance+p_amount,updated_at=now()
    where user_id=p_user_id and balance+p_amount>=0 returning balance into next_balance;
  if next_balance is null then raise exception 'Insufficient wallet balance'; end if;
  insert into public.mh_wallet_transactions(user_id,amount,transaction_type,description,reference)
    values(p_user_id,p_amount,'adjustment',left(coalesce(p_description,'Admin adjustment'),240),p_reference);
  return next_balance;
end; $$;
revoke all on function public.mh_admin_adjust_wallet(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.mh_admin_adjust_wallet(uuid,bigint,text,text) to service_role;

create table if not exists public.mh_feature_experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  enabled boolean not null default false,
  traffic_percent integer not null default 0 check (traffic_percent between 0 and 100),
  variants jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.mh_feature_experiments enable row level security;
drop policy if exists "Magic Hour owner reads experiments" on public.mh_feature_experiments;
create policy "Magic Hour owner reads experiments" on public.mh_feature_experiments for select to authenticated using (lower(coalesce((select auth.jwt()->>'email'),''))='ugohjeremiah16@gmail.com' and exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.role in ('admin','owner','super_admin')));

create table if not exists public.mh_support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  email text not null,
  subject text not null check (char_length(subject) between 3 and 160),
  message text not null check (char_length(message) between 5 and 5000),
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  admin_reply text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mh_support_tickets_created_idx on public.mh_support_tickets(created_at desc);
alter table public.mh_support_tickets enable row level security;
drop policy if exists "Magic Hour owner reads support tickets" on public.mh_support_tickets;
create policy "Magic Hour owner reads support tickets" on public.mh_support_tickets for select to authenticated using (lower(coalesce((select auth.jwt()->>'email'),''))='ugohjeremiah16@gmail.com' and exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.role in ('admin','owner','super_admin')));

-- The browser can read only rows allowed by the owner-only RLS policies.
-- Privileged writes are performed exclusively by the authenticated Edge Function.
revoke all on public.mh_site_settings, public.mh_site_features, public.mh_admin_audit_log,
  public.mh_feature_experiments, public.mh_support_tickets from anon;
grant select on public.mh_site_settings, public.mh_site_features, public.mh_admin_audit_log,
  public.mh_feature_experiments, public.mh_support_tickets to authenticated;
grant all on public.mh_site_settings, public.mh_site_features, public.mh_admin_audit_log,
  public.mh_feature_experiments, public.mh_support_tickets to service_role;
