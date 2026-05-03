-- ロビー: 作成者だけが部屋にいる間、桁数・マッチ先取を変更可能。
-- 参加検知: room_members を Realtime に追加。

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
  if r.status is distinct from 'waiting' then
    raise exception 'only while waiting for game start';
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

revoke all on function public.room_update_lobby_settings(uuid, smallint, smallint) from public;
grant execute on function public.room_update_lobby_settings(uuid, smallint, smallint) to authenticated;

alter publication supabase_realtime add table public.room_members;
