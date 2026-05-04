-- CHANGE は公開ログの slot のみ（桁の数字は secrets に載せない）。

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
  i int;
  nd text;
  new_secret text;
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

  insert into public.room_item_events (room_id, actor_id, item_kind, public_data)
  values (
    p_room_id,
    uid,
    'CHANGE',
    jsonb_build_object('slot', p_slot)
  );

  perform public.pass_turn_to_opponent(p_room_id, uid);

  return jsonb_build_object('slot', p_slot);
end;
$$;
