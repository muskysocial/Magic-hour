-- Magic Hour wallet billing and promotional card foundation.
create table if not exists public.mh_magic_hour_cards (
 id uuid primary key default gen_random_uuid(),
 card_number text not null unique,
 promo_code_hash text not null unique,
 promo_code_hint text not null,
 reward_type text not null check (reward_type in ('coins','membership','combined')),
 coin_reward bigint not null default 0 check (coin_reward >= 0),
 membership_plan text check (membership_plan in ('gold','silver','platinum')),
 membership_days integer not null default 30 check (membership_days between 1 and 3650),
 prize_label text not null,
 expires_at timestamptz,
 status text not null default 'active' check (status in ('active','redeemed','expired','revoked')),
 created_by uuid not null references auth.users(id),
 redeemed_by uuid references auth.users(id),
 redeemed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists mh_magic_hour_cards_status_created_idx on public.mh_magic_hour_cards(status,created_at desc);
alter table public.mh_magic_hour_cards enable row level security;
drop policy if exists "Users can view their redeemed Magic Hour cards" on public.mh_magic_hour_cards;
create policy "Users can view their redeemed Magic Hour cards" on public.mh_magic_hour_cards for select to authenticated using (redeemed_by = auth.uid());
create table if not exists public.mh_room_pricing (
 room_key text primary key,
 standard_coin_rate integer not null check (standard_coin_rate >= 0),
 premium_coin_rate integer not null check (premium_coin_rate >= 0),
 billing_unit_seconds integer not null default 1800 check (billing_unit_seconds > 0),
 updated_at timestamptz not null default now()
);
insert into public.mh_room_pricing(room_key,standard_coin_rate,premium_coin_rate,billing_unit_seconds)
values ('live-tracking',1200,800,1800),('headswap',400,400,1),('video-face-swap',300,300,10)
on conflict(room_key) do update set standard_coin_rate=excluded.standard_coin_rate,premium_coin_rate=excluded.premium_coin_rate,billing_unit_seconds=excluded.billing_unit_seconds,updated_at=now();

create or replace function public.mh_redeem_magic_hour_card(p_code text)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
 v_user uuid := auth.uid();
 v_card public.mh_magic_hour_cards%rowtype;
 v_hash text;
 v_balance bigint;
 v_now timestamptz := now();
begin
 if v_user is null then raise exception 'Sign in to redeem your card.'; end if;
 if length(trim(coalesce(p_code,''))) < 6 or length(trim(p_code)) > 80 then raise exception 'Enter a valid card code.'; end if;
 v_hash := encode(digest(upper(regexp_replace(trim(p_code),'[^A-Za-z0-9]','','g')),'sha256'),'hex');
 select * into v_card from public.mh_magic_hour_cards where promo_code_hash=v_hash for update;
 if not found then raise exception 'Card code not found.'; end if;
 if v_card.status <> 'active' then raise exception 'This card has already been used or is no longer active.'; end if;
 if v_card.expires_at is not null and v_card.expires_at <= v_now then
   update public.mh_magic_hour_cards set status='expired' where id=v_card.id;
   raise exception 'This card has expired.';
 end if;
 if v_card.coin_reward > 0 then
   insert into public.mh_wallets(user_id,balance) values(v_user,0) on conflict(user_id) do nothing;
   update public.mh_wallets set balance=balance+v_card.coin_reward,updated_at=v_now where user_id=v_user returning balance into v_balance;
   insert into public.mh_wallet_transactions(user_id,amount,transaction_type,description,reference)
   values(v_user,v_card.coin_reward,'reward','MAGIC HOUR CARD reward '||v_card.card_number,'mhcard:'||v_card.id::text);
 end if;
 if v_card.membership_plan is not null then
   insert into public.mh_memberships(user_id,plan_key,plan_name,started_at,expires_at,unlimited_generations,unlimited_duration,updated_at)
   values(v_user,v_card.membership_plan,initcap(v_card.membership_plan),v_now,v_now+make_interval(days=>v_card.membership_days),false,false,v_now)
   on conflict(user_id) do update set plan_key=excluded.plan_key,plan_name=excluded.plan_name,started_at=v_now,expires_at=greatest(coalesce(mh_memberships.expires_at,v_now),v_now)+make_interval(days=>v_card.membership_days),unlimited_generations=false,unlimited_duration=false,updated_at=v_now;
 end if;
 update public.mh_magic_hour_cards set status='redeemed',redeemed_by=v_user,redeemed_at=v_now where id=v_card.id;
 return jsonb_build_object('ok',true,'prize',v_card.prize_label,'coin_reward',v_card.coin_reward,'membership_plan',v_card.membership_plan,'balance',v_balance);
end; $$;
revoke all on function public.mh_redeem_magic_hour_card(text) from public;
grant execute on function public.mh_redeem_magic_hour_card(text) to authenticated;
