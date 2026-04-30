-- マッチ（BO）通算: 各プレイヤーが 6 種アイテムをそれぞれ 1 回まで。ゲーム間では使用済みを引き継ぐ（秘密・コールのみリセット）。

create table public.room_item_cards (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  item_kind text not null
    constraint room_item_cards_kind_check check (
      item_kind in ('DOUBLE', 'HIGHLOW', 'TARGET', 'SLASH', 'SHUFFLE', 'CHANGE')
    ),
  used_at timestamptz null,
  primary key (room_id, user_id, item_kind)
);

create index room_item_cards_room_id_idx on public.room_item_cards (room_id);

comment on table public.room_item_cards is 'BO マッチ中の各プレイヤーのアイテムカード。各 item_kind は使用で used_at を立て、マッチ終了まで再利用しない。';

alter table public.room_item_cards enable row level security;

create policy room_item_cards_select on public.room_item_cards
  for select to authenticated
  using (public.is_room_member(room_id));

-- 書き込みは将来の RPC / トリガーのみ（クライアント直更新はしない）

create or replace function public.room_members_seed_item_cards()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c int;
  m record;
  k text;
  kinds text[] := array['DOUBLE', 'HIGHLOW', 'TARGET', 'SLASH', 'SHUFFLE', 'CHANGE'];
begin
  select count(*)::int into c from public.room_members where room_id = new.room_id;
  if c < 2 then
    return new;
  end if;
  for m in select user_id from public.room_members where room_id = new.room_id
  loop
    foreach k in array kinds
    loop
      insert into public.room_item_cards (room_id, user_id, item_kind, used_at)
      values (new.room_id, m.user_id, k, null)
      on conflict (room_id, user_id, item_kind) do nothing;
    end loop;
  end loop;
  return new;
end;
$$;

create trigger room_members_seed_item_cards
  after insert on public.room_members
  for each row execute function public.room_members_seed_item_cards();

-- マイグレーション適用前から 2 人在室のルームのバックフィル
insert into public.room_item_cards (room_id, user_id, item_kind, used_at)
select r.id, m.user_id, v.kind, null
from public.rooms r
join public.room_members m on m.room_id = r.id
cross join (
  values
    ('DOUBLE'),
    ('HIGHLOW'),
    ('TARGET'),
    ('SLASH'),
    ('SHUFFLE'),
    ('CHANGE')
) as v(kind)
where (select count(*)::int from public.room_members x where x.room_id = r.id) = 2
on conflict (room_id, user_id, item_kind) do nothing;

alter publication supabase_realtime add table public.room_item_cards;
