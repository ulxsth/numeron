-- DOUBLE 開示桁の指定をアイテム使用者（攻撃側）に限定する。

comment on column public.rooms.double_phase is
  'null=通常。await_reveal=ダブル使用者が桁指定待ち。first_call/second_call=連続コール中。';

create or replace function public.double_submit_reveal_slot(p_room_id uuid, p_slot smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.rooms%rowtype;
  d text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into r from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room not found';
  end if;
  if r.double_phase is distinct from 'await_reveal' then
    raise exception 'not awaiting reveal slot';
  end if;
  if r.double_attacker_id is null then
    raise exception 'invalid double state';
  end if;
  if r.double_attacker_id is distinct from uid then
    raise exception 'only double attacker chooses reveal slot';
  end if;
  if r.current_turn_user_id is distinct from uid then
    raise exception 'not your turn';
  end if;

  if not exists (
    select 1 from public.room_members m
    where m.room_id = p_room_id and m.user_id = uid
  ) then
    raise exception 'not a member';
  end if;

  if p_slot < 1 or p_slot > r.digit_length then
    raise exception 'invalid slot';
  end if;

  select substr(s.digits, p_slot::int, 1) into d
  from public.room_secrets s
  where s.room_id = p_room_id and s.user_id = r.double_attacker_id;
  if d is null or length(d) <> 1 then
    raise exception 'attacker secret missing';
  end if;

  update public.rooms
  set
    double_phase = 'first_call',
    double_reveal_slot = p_slot,
    double_reveal_digit = d
  where id = p_room_id;
end;
$$;

create or replace function public.guesses_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms%rowtype;
  opp_uid uuid;
  opp_secret text;
  hb record;
begin
  select * into r from public.rooms where id = new.room_id for share;
  if not found then
    raise exception 'room not found';
  end if;
  if r.status is distinct from 'playing' then
    raise exception 'game not playing';
  end if;

  if r.double_phase = 'await_reveal' then
    raise exception 'complete double digit reveal first';
  end if;

  if r.current_turn_user_id is distinct from new.guesser_id then
    raise exception 'not your turn';
  end if;

  perform public.validate_digit_string(new.digits, r.digit_length);

  select user_id into opp_uid
  from public.room_members
  where room_id = new.room_id and user_id <> new.guesser_id
  limit 1;
  if opp_uid is null then
    raise exception 'opponent not found';
  end if;

  select digits into opp_secret from public.room_secrets where room_id = new.room_id and user_id = opp_uid;
  if opp_secret is null then
    raise exception 'opponent secret missing';
  end if;

  select * into hb from public.compute_hit_blow(opp_secret, new.digits, r.digit_length);
  new.hit := hb.hit;
  new.blow := hb.blow;

  return new;
end;
$$;
