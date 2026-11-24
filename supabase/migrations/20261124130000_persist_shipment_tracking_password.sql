alter table public.ms_shipments add column if not exists access_password text;
comment on column public.ms_shipments.access_password is 'Owner-only copy of the generated tracking password so the sender can retrieve it later. Never select or return this field from public tracking endpoints.';
