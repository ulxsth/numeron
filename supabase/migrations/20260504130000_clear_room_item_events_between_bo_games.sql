-- BO でゲームが切り替わるとき guesses / room_secrets と同様にアイテム履歴もリセットする。
-- （room_item_cards はマッチ通算のまま、cascade で secrets も削除される）

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
      delete from public.room_item_events where room_id = new.room_id;
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
