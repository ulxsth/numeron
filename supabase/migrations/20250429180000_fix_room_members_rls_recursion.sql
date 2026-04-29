-- room_members_select が room_members 自身をサブクエリしていたため、rooms_select 経由で無限再帰になる。
-- メンバー判定と定員チェックは SECURITY DEFINER で RLS を回避する。

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members rm
    where rm.room_id = p_room_id and rm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

drop policy if exists room_members_select on public.room_members;

create policy room_members_select on public.room_members
  for select to authenticated
  using (public.is_room_member(room_id));

create or replace function public.room_members_enforce_two()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c int;
begin
  select count(*) into c from public.room_members where room_id = new.room_id;
  if c >= 2 then
    raise exception 'room is full';
  end if;
  return new;
end;
$$;
