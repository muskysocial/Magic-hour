create table if not exists public.ms_shipment_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.ms_shipments(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz
);

alter table public.ms_shipment_push_subscriptions
  add column if not exists subscriber_role text not null default 'viewer',
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

alter table public.ms_shipment_push_subscriptions
  drop constraint if exists ms_shipment_push_subscriptions_subscriber_role_check;

alter table public.ms_shipment_push_subscriptions
  add constraint ms_shipment_push_subscriptions_subscriber_role_check
  check (subscriber_role in ('viewer','owner'));

drop index if exists public.ms_shipment_push_subscriptions_shipment_endpoint_uidx;

create unique index if not exists ms_shipment_push_subscriptions_shipment_endpoint_role_uidx
  on public.ms_shipment_push_subscriptions (shipment_id, endpoint, subscriber_role);

create index if not exists ms_shipment_push_subscriptions_shipment_active_idx
  on public.ms_shipment_push_subscriptions (shipment_id)
  where is_active = true;

create index if not exists ms_shipment_push_subscriptions_owner_idx
  on public.ms_shipment_push_subscriptions (owner_user_id, shipment_id)
  where subscriber_role = 'owner' and is_active = true;

alter table public.ms_shipment_push_subscriptions enable row level security;
revoke all on public.ms_shipment_push_subscriptions from anon, authenticated;
grant all on public.ms_shipment_push_subscriptions to service_role;

alter table public.ms_shipment_notifications
  add column if not exists push_sent_at timestamptz;

comment on column public.ms_shipment_push_subscriptions.subscriber_role is
  'viewer receives recipient-facing shipment updates; owner receives shipment-linked messages in Magic Hour.';
comment on column public.ms_shipment_push_subscriptions.owner_user_id is
  'Authenticated Magic Hour account that owns the shipment; populated only for owner device subscriptions.';
