-- DOUBLE を room_item_events に載せ履歴へ統合する。
-- HIGHLOW/TARGET/SLASH/CHANGE の結果ペイロードを相手にも複製し、ログで結果が読めるようにする。

alter table public.room_item_events drop constraint if exists room_item_events_kind_check;

alter table public.room_item_events add constraint room_item_events_kind_check check (
  item_kind in ('DOUBLE', 'HIGHLOW', 'TARGET', 'SLASH', 'SHUFFLE', 'CHANGE')
);

-- --- DOUBLE 開始 -----------------------------------------------------------------

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

  insert into public.room_item_events (room_id, actor_id, item_kind, public_data)
  values (
    p_room_id,
    uid,
    'DOUBLE',
    jsonb_build_object('phase', 'await_reveal')
  );

  update public.rooms
  set
    double_attacker_id = uid,
    double_phase = 'await_reveal',
    double_reveal_slot = null,
    double_reveal_digit = null
  where id = p_room_id;
end;
$$;

-- --- DOUBLE 開示桁 ----------------------------------------------------------------

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

  update public.room_item_events e
  set public_data = coalesce(e.public_data, '{}'::jsonb)
    || jsonb_build_object(
      'phase', 'revealed',
      'reveal_slot', p_slot,
      'reveal_digit', d
    )
  where e.id = (
    select id from public.room_item_events
    where room_id = p_room_id and item_kind = 'DOUBLE'
    order by created_at desc
    limit 1
  );

  update public.rooms
  set
    double_phase = 'first_call',
    double_reveal_slot = p_slot,
    double_reveal_digit = d
  where id = p_room_id;
end;
$$;

-- --- アイテム: 結果を相手にも viewer ペイロードとして複製 ------------------------------

create or replace function public.item_highlow_use(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.rooms%rowtype;
  opp_uid uuid;
  opp_secret text;
  ev_id uuid;
  i int;
  ch text;
  levels jsonb := '[]'::jsonb;
  lvl text;
  payload jsonb;
begin
  r := public.assert_item_turn(p_room_id);
  perform public.consume_room_item_card(p_room_id, uid, 'HIGHLOW');

  select user_id into opp_uid
  from public.room_members
  where room_id = p_room_id and user_id <> uid
  limit 1;

  select digits into opp_secret
  from public.room_secrets
  where room_id = p_room_id and user_id = opp_uid;

  if opp_secret is null then
    raise exception 'opponent secret missing';
  end if;

  for i in 1..length(opp_secret) loop
    ch := substr(opp_secret, i, 1);
    if ch::int >= 5 then
      lvl := 'H';
    else
      lvl := 'L';
    end if;
    levels := levels || jsonb_build_array(lvl);
  end loop;

  payload := jsonb_build_object('levels', levels);

  insert into public.room_item_events (room_id, actor_id, item_kind, public_data)
  values (p_room_id, uid, 'HIGHLOW', '{}'::jsonb)
  returning id into ev_id;

  insert into public.room_item_event_secrets (event_id, viewer_id, payload)
  values (ev_id, uid, payload),
         (ev_id, opp_uid, payload);

  perform public.pass_turn_to_opponent(p_room_id, uid);

  return payload;
end;
$$;

create or replace function public.item_target_use(p_room_id uuid, p_digit smallint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.rooms%rowtype;
  opp_uid uuid;
  opp_secret text;
  ev_id uuid;
  pos int;
  payload jsonb;
begin
  if p_digit < 0 or p_digit > 9 then
    raise exception 'invalid digit';
  end if;

  r := public.assert_item_turn(p_room_id);
  perform public.consume_room_item_card(p_room_id, uid, 'TARGET');

  select user_id into opp_uid
  from public.room_members
  where room_id = p_room_id and user_id <> uid
  limit 1;

  select digits into opp_secret
  from public.room_secrets
  where room_id = p_room_id and user_id = opp_uid;

  if opp_secret is null then
    raise exception 'opponent secret missing';
  end if;

  pos := position(p_digit::text in opp_secret);
  if pos > 0 then
    payload := jsonb_build_object('contains', true, 'slot', pos);
  else
    payload := jsonb_build_object('contains', false);
  end if;

  insert into public.room_item_events (room_id, actor_id, item_kind, public_data)
  values (
    p_room_id,
    uid,
    'TARGET',
    jsonb_build_object('queried_digit', p_digit)
  )
  returning id into ev_id;

  insert into public.room_item_event_secrets (event_id, viewer_id, payload)
  values (ev_id, uid, payload),
         (ev_id, opp_uid, payload);

  perform public.pass_turn_to_opponent(p_room_id, uid);

  return payload;
end;
$$;

create or replace function public.item_slash_use(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.rooms%rowtype;
  opp_uid uuid;
  opp_secret text;
  ev_id uuid;
  d int;
  min_d int := 9;
  max_d int := 0;
  spread int;
  sorted_str text;
  payload jsonb;
begin
  r := public.assert_item_turn(p_room_id);
  perform public.consume_room_item_card(p_room_id, uid, 'SLASH');

  select user_id into opp_uid
  from public.room_members
  where room_id = p_room_id and user_id <> uid
  limit 1;

  select digits into opp_secret
  from public.room_secrets
  where room_id = p_room_id and user_id = opp_uid;

  if opp_secret is null then
    raise exception 'opponent secret missing';
  end if;

  for d in 1..length(opp_secret) loop
    min_d := least(min_d, substr(opp_secret, d, 1)::int);
    max_d := greatest(max_d, substr(opp_secret, d, 1)::int);
  end loop;
  spread := max_d - min_d;

  select string_agg(substr(opp_secret, g, 1), '' order by substr(opp_secret, g, 1)::int)
  into sorted_str
  from generate_series(1, length(opp_secret)) g;

  payload := jsonb_build_object(
    'min', min_d,
    'max', max_d,
    'spread', spread,
    'sorted_digits', sorted_str
  );

  insert into public.room_item_events (room_id, actor_id, item_kind, public_data)
  values (p_room_id, uid, 'SLASH', '{}'::jsonb)
  returning id into ev_id;

  insert into public.room_item_event_secrets (event_id, viewer_id, payload)
  values (ev_id, uid, payload),
         (ev_id, opp_uid, payload);

  perform public.pass_turn_to_opponent(p_room_id, uid);

  return payload;
end;
$$;

create or replace function public.item_change_use(
  p_room_id uuid,
  p_slot smallint,
  p_new_digit smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  opp_uid uuid;
  r public.rooms%rowtype;
  old_secret text;
  new_ch text;
  i int;
  nd text;
  new_secret text;
  ev_id uuid;
  payload jsonb;
begin
  if p_new_digit < 0 or p_new_digit > 9 then
    raise exception 'invalid digit';
  end if;

  r := public.assert_item_turn(p_room_id);
  perform public.consume_room_item_card(p_room_id, uid, 'CHANGE');

  select user_id into opp_uid
  from public.room_members
  where room_id = p_room_id and user_id <> uid
  limit 1;

  if opp_uid is null then
    raise exception 'opponent not found';
  end if;

  select digits into old_secret
  from public.room_secrets
  where room_id = p_room_id and user_id = uid
  for update;

  if old_secret is null then
    raise exception 'your secret missing';
  end if;

  if p_slot < 1 or p_slot > length(old_secret) then
    raise exception 'invalid slot';
  end if;

  nd := p_new_digit::text;
  for i in 1..length(old_secret) loop
    if i is distinct from p_slot::int and substr(old_secret, i, 1) = nd then
      raise exception 'digit already used in secret';
    end if;
  end loop;

  new_secret :=
    substr(old_secret, 1, p_slot - 1)
    || nd
    || substr(old_secret, p_slot + 1);

  perform public.validate_digit_string(new_secret, r.digit_length);

  update public.room_secrets
  set digits = new_secret
  where room_id = p_room_id and user_id = uid;

  payload := jsonb_build_object('digits', new_secret);

  insert into public.room_item_events (room_id, actor_id, item_kind, public_data)
  values (
    p_room_id,
    uid,
    'CHANGE',
    jsonb_build_object('slot', p_slot)
  )
  returning id into ev_id;

  insert into public.room_item_event_secrets (event_id, viewer_id, payload)
  values (ev_id, uid, payload),
         (ev_id, opp_uid, payload);

  perform public.pass_turn_to_opponent(p_room_id, uid);

  return payload;
end;
$$;

-- --- DOUBLE 連続コール終了時にイベントへマーク ---------------------------------------

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
      update public.rooms
      set
        status = 'between_games',
        winner_user_id = null,
        current_turn_user_id = null,
        current_game_index = r.current_game_index + 1,
        match_wins = new_wins,
        double_attacker_id = null,
        double_phase = null,
        double_reveal_slot = null,
        double_reveal_digit = null,
        between_round_ready = '{}'::jsonb
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
      update public.room_item_events e
      set public_data = coalesce(e.public_data, '{}'::jsonb) || jsonb_build_object('completed', true)
      where e.id = (
        select id from public.room_item_events
        where room_id = new.room_id and item_kind = 'DOUBLE'
        order by created_at desc
        limit 1
      );

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
