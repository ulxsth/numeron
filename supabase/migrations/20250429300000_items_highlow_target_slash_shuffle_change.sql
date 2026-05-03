-- HIGHLOW / TARGET / SLASH / SHUFFLE / CHANGE: SECURITY DEFINER RPC + 監査ログ。
-- 攻撃アイテムの開示結果は room_item_event_secrets（viewer_id = 使用者のみ SELECT 可）に分離。

-- --- テーブル -----------------------------------------------------------------

create table public.room_item_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  actor_id uuid not null references auth.users (id) on delete restrict,
  item_kind text not null
    constraint room_item_events_kind_check check (
      item_kind in ('HIGHLOW', 'TARGET', 'SLASH', 'SHUFFLE', 'CHANGE')
    ),
  public_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index room_item_events_room_idx on public.room_item_events (room_id, created_at);

comment on table public.room_item_events is 'アイテム使用の公開ログ（種類・実行者・相手にも見えるメタのみ public_data）。';

create table public.room_item_event_secrets (
  event_id uuid not null references public.room_item_events (id) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  payload jsonb not null,
  primary key (event_id, viewer_id)
);

comment on table public.room_item_event_secrets is '攻撃アイテムの開示など、viewer_id のユーザだけが読める結果。';

alter table public.room_item_events enable row level security;
alter table public.room_item_event_secrets enable row level security;

create policy room_item_events_select on public.room_item_events
  for select to authenticated
  using (public.is_room_member(room_id));

create policy room_item_event_secrets_select on public.room_item_event_secrets
  for select to authenticated
  using (viewer_id = (select auth.uid()));

-- --- 内部: カード消費・手番・ダブル無効 ------------------------------------------------

create or replace function public.assert_item_turn(p_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.rooms%rowtype;
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
    raise exception 'item not allowed during double';
  end if;

  return r;
end;
$$;

revoke all on function public.assert_item_turn(uuid) from public;

create or replace function public.consume_room_item_card(
  p_room_id uuid,
  p_user_id uuid,
  p_item_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.room_item_cards
  set used_at = now()
  where room_id = p_room_id
    and user_id = p_user_id
    and item_kind = p_item_kind
    and used_at is null;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'item card not available';
  end if;
end;
$$;

revoke all on function public.consume_room_item_card(uuid, uuid, text) from public;

create or replace function public.pass_turn_to_opponent(p_room_id uuid, p_current uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  opp uuid;
begin
  select user_id into opp
  from public.room_members
  where room_id = p_room_id and user_id <> p_current
  limit 1;
  if opp is null then
    raise exception 'opponent not found';
  end if;
  update public.rooms
  set current_turn_user_id = opp
  where id = p_room_id;
end;
$$;

revoke all on function public.pass_turn_to_opponent(uuid, uuid) from public;

-- --- HIGHLOW: 左から各桁が H(5–9) / L(0–4) -----------------------------------------

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
  values (ev_id, uid, payload);

  perform public.pass_turn_to_opponent(p_room_id, uid);

  return payload;
end;
$$;

revoke all on function public.item_highlow_use(uuid) from public;
grant execute on function public.item_highlow_use(uuid) to authenticated;

-- --- TARGET: 0–9 を 1 桁指定、含有なら左からの桁位置（1 始まり）を開示 ---------------

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
  values (ev_id, uid, payload);

  perform public.pass_turn_to_opponent(p_room_id, uid);

  return payload;
end;
$$;

revoke all on function public.item_target_use(uuid, smallint) from public;
grant execute on function public.item_target_use(uuid, smallint) to authenticated;

-- --- SLASH: 最小・最大・差、昇順に並べた桁の文字列 ---------------------------------

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
  values (ev_id, uid, payload);

  perform public.pass_turn_to_opponent(p_room_id, uid);

  return payload;
end;
$$;

revoke all on function public.item_slash_use(uuid) from public;
grant execute on function public.item_slash_use(uuid) to authenticated;

-- --- SHUFFLE: 自分のナンバーの並びをランダムに入れ替え -----------------------------------

create or replace function public.item_shuffle_use(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.rooms%rowtype;
  old_secret text;
  new_secret text;
begin
  r := public.assert_item_turn(p_room_id);
  perform public.consume_room_item_card(p_room_id, uid, 'SHUFFLE');

  select digits into old_secret
  from public.room_secrets
  where room_id = p_room_id and user_id = uid
  for update;

  if old_secret is null then
    raise exception 'your secret missing';
  end if;

  select string_agg(ch, '')
  into new_secret
  from (
    select substr(old_secret, g, 1) as ch
    from generate_series(1, length(old_secret)) g
    order by random()
  ) sub;

  update public.room_secrets
  set digits = new_secret
  where room_id = p_room_id and user_id = uid;

  insert into public.room_item_events (room_id, actor_id, item_kind, public_data)
  values (p_room_id, uid, 'SHUFFLE', '{}'::jsonb);

  perform public.pass_turn_to_opponent(p_room_id, uid);

  return jsonb_build_object('digits', new_secret);
end;
$$;

revoke all on function public.item_shuffle_use(uuid) from public;
grant execute on function public.item_shuffle_use(uuid) to authenticated;

-- --- CHANGE: 自分のナンバーの 1 桁を、他桁と重複しない別の数字に差し替え ---------------

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
  r public.rooms%rowtype;
  old_secret text;
  new_ch text;
  i int;
  nd text;
  new_secret text;
begin
  if p_new_digit < 0 or p_new_digit > 9 then
    raise exception 'invalid digit';
  end if;

  r := public.assert_item_turn(p_room_id);
  perform public.consume_room_item_card(p_room_id, uid, 'CHANGE');

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

  insert into public.room_item_events (room_id, actor_id, item_kind, public_data)
  values (
    p_room_id,
    uid,
    'CHANGE',
    jsonb_build_object('slot', p_slot)
  );

  perform public.pass_turn_to_opponent(p_room_id, uid);

  return jsonb_build_object('digits', new_secret);
end;
$$;

revoke all on function public.item_change_use(uuid, smallint, smallint) from public;
grant execute on function public.item_change_use(uuid, smallint, smallint) to authenticated;

-- --- Realtime ----------------------------------------------------------------

alter publication supabase_realtime add table public.room_item_events;
