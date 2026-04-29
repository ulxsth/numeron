-- created_by は JWT と DB の両方から同じ値に揃える（明示せず DEFAULT で埋める）。
-- auth.users に存在しない古いセッションは、アプリ起動時の getUser で捨てる想定。
alter table public.rooms
  alter column created_by set default auth.uid();
