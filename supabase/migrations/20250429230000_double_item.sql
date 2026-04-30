-- DOUBLE: 攻撃側がカード消費 → 防御側が開示桁を指定 → 攻撃側がコール2連続（1 ターン）。

alter table public.rooms
  add column double_attacker_id uuid null references auth.users (id) on delete set null,
  add column double_phase text null
    constraint rooms_double_phase_check check (
      double_phase is null
      or double_phase in ('await_reveal', 'first_call', 'second_call')
    ),
  add column double_reveal_slot smallint null,
  add column double_reveal_digit text null;

comment on column public.rooms.double_phase is 'null=通常。await_reveal=防御が桁指定待ち。first_call/second_call=攻撃の連続コール中。';

-- --- RPC: ダブル宣言（カード消費・相手に開示桁選択を依頼） ---------------------------------

create or replace function public.double_start(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.rooms%rowtype;
  n int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into r from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room not found';
  end if;
  if r.status is distinct from 'playing' then
    raise exception 'game not playing';
  end if;
  if r.current_turn_user_id is distinct from uid then
    raise exception 'not your turn';
  end if;
  if r.double_phase is not null then
    raise exception 'double already in progress';
  end if;

  update public.room_item_cards
  set used_at = now()
  where room_id = p_room_id
    and user_id = uid
    and item_kind = 'DOUBLE'
    and used_at is null;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'double card not available';
  end if;

  update public.rooms
  set
    double_attacker_id = uid,
    double_phase = 'await_reveal',
    double_reveal_slot = null,
    double_reveal_digit = null
  where id = p_room_id;
end;
$$;

revoke all on function public.double_start(uuid) from public;
grant execute on function public.double_start(uuid) to authenticated;

-- --- RPC: 防御側が開示する桁（1 始まり）を指定 -----------------------------------------

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
  opp uuid;
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
  if r.double_attacker_id = uid then
    raise exception 'attacker cannot choose reveal';
  end if;

  select user_id into opp
  from public.room_members
  where room_id = p_room_id and user_id = r.double_attacker_id
  limit 1;
  if opp is null then
    raise exception 'attacker not in room';
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

revoke all on function public.double_submit_reveal_slot(uuid, smallint) from public;
grant execute on function public.double_submit_reveal_slot(uuid, smallint) to authenticated;

-- --- 推測: ダブル中は段階に応じて手番・アイテム状態を更新 ---------------------------------

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
    raise exception 'wait for opponent to pick reveal slot';
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

create or replace function public.guesses_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms%rowtype;
  opp_uid uuid;
  uid_text text;
  prev_w int;
  new_w int;
  new_wins jsonb;
begin
  select * into r from public.rooms where id = new.room_id;

  if new.hit >= r.digit_length then
    uid_text := new.guesser_id::text;
    prev_w := coalesce((r.match_wins->>uid_text)::int, 0);
    new_w := prev_w + 1;
    new_wins := coalesce(r.match_wins, '{}'::jsonb) || jsonb_build_object(uid_text, new_w);

    if new_w >= r.match_wins_required then
      update public.rooms
      set
        status = 'finished',
        winner_user_id = new.guesser_id,
        current_turn_user_id = null,
        match_wins = new_wins,
        double_attacker_id = null,
        double_phase = null,
        double_reveal_slot = null,
        double_reveal_digit = null
      where id = new.room_id;
    else
      delete from public.guesses where room_id = new.room_id;
      delete from public.room_secrets where room_id = new.room_id;
      update public.rooms
      set
        status = 'waiting',
        winner_user_id = null,
        current_turn_user_id = null,
        current_game_index = r.current_game_index + 1,
        match_wins = new_wins,
        double_attacker_id = null,
        double_phase = null,
        double_reveal_slot = null,
        double_reveal_digit = null
      where id = new.room_id;
    end if;
  else
    select user_id into opp_uid
    from public.room_members
    where room_id = new.room_id and user_id <> new.guesser_id
    limit 1;

    if r.double_phase = 'first_call'
       and r.double_attacker_id is not distinct from new.guesser_id then
      update public.rooms
      set double_phase = 'second_call'
      where id = new.room_id;
    elsif r.double_phase = 'second_call'
          and r.double_attacker_id is not distinct from new.guesser_id then
      update public.rooms
      set
        current_turn_user_id = opp_uid,
        double_attacker_id = null,
        double_phase = null,
        double_reveal_slot = null,
        double_reveal_digit = null
      where id = new.room_id;
    else
      update public.rooms
      set current_turn_user_id = opp_uid
      where id = new.room_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.room_secrets_try_start_game()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count int;
  secret_count int;
  cb uuid;
  gidx int;
  opp uuid;
  first_u uuid;
begin
  select count(*) into member_count from public.room_members where room_id = new.room_id;
  select count(*) into secret_count from public.room_secrets where room_id = new.room_id;

  if member_count = 2 and secret_count = 2 then
    select r.created_by, r.current_game_index
    into cb, gidx
    from public.rooms r
    where r.id = new.room_id;

    select m.user_id
    into opp
    from public.room_members m
    where m.room_id = new.room_id and m.user_id <> cb
    limit 1;

    if opp is null then
      first_u := cb;
    elsif mod(gidx, 2) = 1 then
      first_u := cb;
    else
      first_u := opp;
    end if;

    update public.rooms
    set
      status = 'playing',
      current_turn_user_id = first_u,
      double_attacker_id = null,
      double_phase = null,
      double_reveal_slot = null,
      double_reveal_digit = null
    where id = new.room_id
      and status = 'waiting';
  end if;
  return new;
end;
$$;
