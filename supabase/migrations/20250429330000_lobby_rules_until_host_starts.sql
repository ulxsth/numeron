-- ルール変更: lobby 中は 2 人在室でも可。2 人いるときはホスト（created_by）のみ。固定はホストがナンバー設定開始（waiting へ）したあと。

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
    raise exception 'only while in lobby';
  end if;

  select count(*)::int into mc from public.room_members where room_id = p_room_id;
  if mc < 1 or mc > 2 then
    raise exception 'invalid member count';
  end if;

  if mc = 2 and r.created_by is distinct from uid then
    raise exception 'only host can change rules when two in lobby';
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
