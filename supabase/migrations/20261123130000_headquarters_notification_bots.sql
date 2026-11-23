create table if not exists public.ms_shipment_notifications (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.ms_shipments(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  bot_key text not null default 'headquarters',
  bot_name text not null default 'Magic Hour Headquarters',
  message text not null check (char_length(message) between 1 and 1200),
  trigger_type text not null default 'status' check (trigger_type in ('status','scheduled','manual')),
  trigger_status text,
  scheduled_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ms_shipment_notifications_schedule_check
    check (trigger_type <> 'scheduled' or scheduled_at is not null),
  constraint ms_shipment_notifications_expiry_check
    check (expires_at is null or scheduled_at is null or expires_at > scheduled_at)
);

create index if not exists ms_shipment_notifications_shipment_idx
  on public.ms_shipment_notifications (shipment_id, is_active, scheduled_at);
create index if not exists ms_shipment_notifications_owner_idx
  on public.ms_shipment_notifications (owner_user_id, created_at desc);

alter table public.ms_shipment_notifications enable row level security;

drop policy if exists "Shipment owners manage headquarters notifications" on public.ms_shipment_notifications;
create policy "Shipment owners manage headquarters notifications"
  on public.ms_shipment_notifications for all to authenticated
  using (owner_user_id = auth.uid() and exists (
    select 1 from public.ms_shipments s where s.id = shipment_id and s.user_id = auth.uid()
  ))
  with check (owner_user_id = auth.uid() and exists (
    select 1 from public.ms_shipments s where s.id = shipment_id and s.user_id = auth.uid()
  ));

grant select, insert, update, delete on public.ms_shipment_notifications to authenticated;
grant all on public.ms_shipment_notifications to service_role;

comment on table public.ms_shipment_notifications is
  'Sender-configured notifications presented to recipients as official Magic Hour Headquarters bot updates.';
