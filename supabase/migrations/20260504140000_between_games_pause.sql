-- BO 続行時はすぐ waiting にせず between_games で結果確認。
-- 二者が room_confirm_next_round で確認後に guesses / secrets / item_events を消して waiting へ。

alter table public.rooms drop constraint if exists rooms_status_check;

alter table public.rooms
  add constraint rooms_status_check check (
    status in ('lobby', 'waiting', 'playing', 'finished', 'between_games')
  );

alter table public.rooms
  add column between_round_ready jsonb not null default '{}'::jsonb;

comment on column public.rooms.between_round_ready is
  'between_games 中のみ使用。キーは auth.users.id の文字列、値は確認済みフラグ。二者確認でリセットして waiting へ。';

-- between_games 中はナンバー変更不可（結果確認後に確認 RPC 経由で消えるまで）
create or replace function public.room_secrets_block_in_lobby()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  st text;
begin
  select status into st from public.rooms where id = new.room_id;
  if st is null then
    raise exception 'room not found';
  end if;
  if st = 'lobby' then
    raise exception 'host has not started; room is still in lobby';
  end if;
  if st = 'between_games' then
    raise exception 'between rounds; confirm next round before setting a new number';
  end if;
  return new;
end;
$$;

drop policy if exists room_secrets_select on public.room_secrets;

create policy room_secrets_select on public.room_secrets
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.rooms r
      where r.id = room_secrets.room_id
        and r.status = 'between_games'
        and exists (
          select 1 from public.room_members m
          where m.room_id = r.id and m.user_id = (select auth.uid())
        )
    )
  );

create or replace function public.room_confirm_next_round(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.rooms%rowtype;
  rd jsonb;
  mc int;
  ready_count int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into r from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room not found';
  end if;
  if r.status is distinct from 'between_games' then
    raise exception 'not between rounds';
  end if;

  select count(*)::int into mc from public.room_members where room_id = p_room_id;
  if mc <> 2 then
    raise exception 'need two members';
  end if;

  if not exists (
    select 1 from public.room_members m where m.room_id = p_room_id and m.user_id = uid
  ) then
    raise exception 'not a member';
  end if;

  update public.rooms
  set between_round_ready = coalesce(between_round_ready, '{}'::jsonb) || jsonb_build_object(uid::text, true)
  where id = p_room_id
  returning between_round_ready into rd;

  select count(*)::int into ready_count
  from public.room_members m
  where m.room_id = p_room_id
    and rd ? m.user_id::text;

  if ready_count = 2 then
    delete from public.guesses where room_id = p_room_id;
    delete from public.room_secrets where room_id = p_room_id;
    delete from public.room_item_events where room_id = p_room_id;
    update public.rooms
    set
      status = 'waiting',
      winner_user_id = null,
      current_turn_user_id = null,
      between_round_ready = '{}'::jsonb
    where id = p_room_id;
  end if;
end;
$$;

revoke all on function public.room_confirm_next_round(uuid) from public;
grant execute on function public.room_confirm_next_round(uuid) to authenticated;

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
