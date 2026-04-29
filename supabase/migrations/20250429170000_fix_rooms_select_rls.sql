-- INSERT ... RETURNING は SELECT ポリシーを通す。作成者はまだ room_members にいないので読めない問題を修正。
-- 参加前のプレイヤーが short_code で rooms を 1 件読む必要があるため、waiting の行は認証ユーザーに閲覧を許可。

drop policy if exists rooms_select on public.rooms;

create policy rooms_select on public.rooms
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.room_members m
      where m.room_id = rooms.id and m.user_id = (select auth.uid())
    )
    or status = 'waiting'
  );
