-- room_members INSERT の WITH CHECK が rooms / room_members の RLS に依存しており、
-- メンバー未参加のユーザーからは相手行が見えず条件が破綻することがある。
-- 参加可否だけ SECURITY DEFINER で判定する。

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
      and r.status = 'waiting'
  )
  and (
    select count(*)::int from public.room_members m
    where m.room_id = p_room_id
  ) < 2;
$$;

revoke all on function public.room_can_accept_member(uuid) from public;
grant execute on function public.room_can_accept_member(uuid) to authenticated;

drop policy if exists room_members_insert on public.room_members;

create policy room_members_insert on public.room_members
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.room_can_accept_member(room_id)
  );
