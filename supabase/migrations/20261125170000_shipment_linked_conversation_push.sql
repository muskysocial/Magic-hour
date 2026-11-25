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

create index if not exists ms_shipment_push_subscriptions_owner_idx
  on public.ms_shipment_push_subscriptions (owner_user_id, shipment_id)
  where subscriber_role = 'owner' and is_active = true;

comment on column public.ms_shipment_push_subscriptions.subscriber_role is
  'viewer receives recipient-facing shipment updates; owner receives shipment-linked messages in Magic Hour.';
comment on column public.ms_shipment_push_subscriptions.owner_user_id is
  'Authenticated Magic Hour account that owns the shipment; populated only for owner device subscriptions.';
