-- ロビー状態 lobby を追加。2 人そろうまでナンバー不可。ホストが開始すると waiting（ナンバー設定）へ。

alter table public.rooms drop constraint if exists rooms_status_check;

alter table public.rooms
  add constraint rooms_status_check check (status in ('lobby', 'waiting', 'playing', 'finished'));

-- 参加: lobby / waiting の部屋のみ（枠に空きがあれば）
create or replace function public.room_can_accept_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rooms r
    where r.id = p_room_id
      and r.status in ('lobby', 'waiting')
  )
  and (
    select count(*)::int from public.room_members m
    where m.room_id = p_room_id
  ) < 2;
$$;

-- short_code 検索: lobby も読める
drop policy if exists rooms_select on public.rooms;

create policy rooms_select on public.rooms
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.room_members m
      where m.room_id = rooms.id and m.user_id = (select auth.uid())
    )
    or status in ('lobby', 'waiting')
  );

-- ルール変更: ひとりで lobby のときのみ
create or replace function public.room_update_lobby_settings(
  p_room_id uuid,
  p_digit_length smallint,
  p_match_wins_required smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mc int;
  r public.rooms%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_digit_length not in (3, 4) then
    raise exception 'invalid digit_length';
  end if;
  if p_match_wins_required < 1 or p_match_wins_required > 10 then
    raise exception 'invalid match_wins_required';
  end if;

  select * into r from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room not found';
  end if;
  if r.status is distinct from 'lobby' then
    raise exception 'only while in lobby alone';
  end if;

  select count(*)::int into mc from public.room_members where room_id = p_room_id;
  if mc <> 1 then
    raise exception 'only while alone in lobby';
  end if;

  if not exists (
    select 1 from public.room_members m
    where m.room_id = p_room_id and m.user_id = uid
  ) then
    raise exception 'not a member';
  end if;

  update public.rooms
  set
    digit_length = p_digit_length,
    match_wins_required = p_match_wins_required
  where id = p_room_id;
end;
$$;

-- lobby 中はナンバーの書き込みを禁止（playing 中の UPDATE は CHANGE 等で必要）
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
  return new;
end;
$$;

drop trigger if exists room_secrets_block_in_lobby on public.room_secrets;

create trigger room_secrets_block_in_lobby
  before insert or update of digits on public.room_secrets
  for each row execute function public.room_secrets_block_in_lobby();

-- ホストのみ: 2 人在室で lobby → waiting
create or replace function public.room_host_begin_secret_setup(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mc int;
  r public.rooms%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into r from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room not found';
  end if;
  if r.created_by is distinct from uid then
    raise exception 'only room host can start';
  end if;
  if r.status is distinct from 'lobby' then
    raise exception 'not in lobby';
  end if;

  select count(*)::int into mc from public.room_members where room_id = p_room_id;
  if mc <> 2 then
    raise exception 'need two members';
  end if;

  update public.rooms
  set status = 'waiting'
  where id = p_room_id;
end;
$$;

revoke all on function public.room_host_begin_secret_setup(uuid) from public;
grant execute on function public.room_host_begin_secret_setup(uuid) to authenticated;
