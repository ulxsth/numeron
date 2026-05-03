-- BO 制マッチ: 先取 W 本（1〜10）。1 ゲームごとにナンバー・コール履歴をリセットし、手番の先攻はゲーム番号で交互。

alter table public.rooms
  add column match_wins_required smallint not null default 1
    constraint rooms_match_wins_required_check check (match_wins_required >= 1 and match_wins_required <= 10),
  add column match_wins jsonb not null default '{}'::jsonb,
  add column current_game_index int not null default 1
    constraint rooms_current_game_index_check check (current_game_index >= 1);

comment on column public.rooms.match_wins is '各プレイヤーのマッチ内ゲーム勝利数。キーは auth.users.id の文字列。';

-- クライアントが捏造したスコアやゲーム番号で部屋を作れないようにする
drop policy if exists rooms_insert on public.rooms;

create policy rooms_insert on public.rooms
  for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and created_by = (select auth.uid())
    and match_wins = '{}'::jsonb
    and current_game_index = 1
  );

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
      current_turn_user_id = first_u
    where id = new.room_id
      and status = 'waiting';
  end if;
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
        match_wins = new_wins
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
        match_wins = new_wins
      where id = new.room_id;
    end if;
  else
    select user_id into opp_uid
    from public.room_members
    where room_id = new.room_id and user_id <> new.guesser_id
    limit 1;
    update public.rooms
    set current_turn_user_id = opp_uid
    where id = new.room_id;
  end if;
  return new;
end;
$$;
