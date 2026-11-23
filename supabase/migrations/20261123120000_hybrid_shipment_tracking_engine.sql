alter table public.ms_shipments
  add column if not exists flight_number text,
  add column if not exists aircraft_model text,
  add column if not exists aircraft_registration text,
  add column if not exists origin_airport_code text,
  add column if not exists destination_airport_code text,
  add column if not exists carrier_tracking_number text,
  add column if not exists tracking_source text not null default 'engine',
  add column if not exists route_distance_km numeric,
  add column if not exists estimated_duration_minutes integer,
  add column if not exists route_points jsonb not null default '[]'::jsonb,
  add column if not exists checkpoint_plan jsonb not null default '[]'::jsonb,
  add column if not exists last_engine_update_at timestamptz;

alter table public.ms_shipments
  drop constraint if exists ms_shipments_tracking_source_check;

alter table public.ms_shipments
  add constraint ms_shipments_tracking_source_check
  check (tracking_source in ('engine','manual','carrier_verified'));

comment on column public.ms_shipments.tracking_source is
  'engine = internally calculated journey; manual = sender-entered checkpoints; carrier_verified = a sender-entered update explicitly confirmed against carrier evidence.';
comment on column public.ms_shipments.route_points is
  'Locally calculated route corridor coordinates. These are a simulation/planning path, not live aircraft or vehicle telemetry.';
comment on column public.ms_shipments.checkpoint_plan is
  'Locally generated expected route checkpoints and ETAs; not carrier-confirmed scans.';
