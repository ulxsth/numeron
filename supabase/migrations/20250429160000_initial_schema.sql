-- Phase 1: bidirectional Hit & Blow (Numeron-style), schema + RLS + triggers + realtime

-- --- tables -----------------------------------------------------------------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  short_code text not null unique,
  status text not null constraint rooms_status_check check (status in ('waiting', 'playing', 'finished')),
  digit_length smallint not null constraint rooms_digit_length_check check (digit_length in (3, 4)),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete restrict,
  current_turn_user_id uuid references auth.users (id) on delete set null,
  winner_user_id uuid references auth.users (id) on delete set null
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.room_secrets (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  digits text not null,
  primary key (room_id, user_id)
);

create table public.guesses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  guesser_id uuid not null references auth.users (id) on delete restrict,
  digits text not null,
  hit smallint not null default 0,
  blow smallint not null default 0,
  created_at timestamptz not null default now()
);

create index guesses_room_id_created_at_idx on public.guesses (room_id, created_at);

-- --- helpers ----------------------------------------------------------------

create or replace function public.validate_digit_string(p_digits text, p_len smallint)
returns void
language plpgsql
immutable
as $$
declare
  distinct_count int;
begin
  if length(p_digits) != p_len then
    raise exception 'invalid digit string length';
  end if;
  if p_digits !~ '^[0-9]+$' then
    raise exception 'non-numeric digit string';
  end if;
  select count(distinct substr(p_digits, g, 1)) into distinct_count
  from generate_series(1, length(p_digits)) g;
  if distinct_count != length(p_digits) then
    raise exception 'duplicate digits';
  end if;
end;
$$;

-- Matches packages/core scoreHitBlowWithDigits (distinct digits, same length).
create or replace function public.compute_hit_blow(secret text, guess text, expected_len smallint, out hit smallint, out blow smallint)
language plpgsql
immutable
as $$
declare
  hit_count int := 0;
  blow_count int := 0;
  i int;
  d int;
  ch text;
  s_chars text[] := array[]::text[];
  g_chars text[] := array[]::text[];
  sc text;
  gc text;
begin
  perform public.validate_digit_string(secret, expected_len);
  perform public.validate_digit_string(guess, expected_len);

  for i in 1..length(secret) loop
    sc := substr(secret, i, 1);
    gc := substr(guess, i, 1);
    if sc = gc then
      hit_count := hit_count + 1;
    else
      s_chars := array_append(s_chars, sc);
      g_chars := array_append(g_chars, gc);
    end if;
  end loop;

  for d in 0..9 loop
    ch := d::text;
    blow_count := blow_count + least(
      (select count(*)::int from unnest(s_chars) x where x = ch),
      (select count(*)::int from unnest(g_chars) x where x = ch)
    );
  end loop;

  hit := hit_count::smallint;
  blow := blow_count::smallint;
end;
$$;

-- Max 2 members per room
create or replace function public.room_members_enforce_two()
returns trigger
language plpgsql
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

create trigger room_members_enforce_two
  before insert on public.room_members
  for each row execute function public.room_members_enforce_two();

create or replace function public.room_secrets_validate()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  dl smallint;
begin
  select digit_length into dl from public.rooms where id = new.room_id;
  if dl is null then
    raise exception 'room not found';
  end if;
  perform public.validate_digit_string(new.digits, dl);
  return new;
end;
$$;

create trigger room_secrets_validate
  before insert or update of digits on public.room_secrets
  for each row execute function public.room_secrets_validate();

-- Start game when 2 members and 2 secrets
create or replace function public.room_secrets_try_start_game()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count int;
  secret_count int;
begin
  select count(*) into member_count from public.room_members where room_id = new.room_id;
  select count(*) into secret_count from public.room_secrets where room_id = new.room_id;

  if member_count = 2 and secret_count = 2 then
    update public.rooms
    set
      status = 'playing',
      current_turn_user_id = created_by
    where id = new.room_id
      and status = 'waiting';
  end if;
  return new;
end;
$$;

create trigger room_secrets_try_start_game
  after insert or update of digits on public.room_secrets
  for each row execute function public.room_secrets_try_start_game();

create or replace function public.guesses_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms%rowtype;
  opp_uid uuid;
  opp_secret text;
  hb record;
begin
  select * into r from public.rooms where id = new.room_id for share;
  if not found then
    raise exception 'room not found';
  end if;
  if r.status is distinct from 'playing' then
    raise exception 'game not playing';
  end if;
  if r.current_turn_user_id is distinct from new.guesser_id then
    raise exception 'not your turn';
  end if;

  perform public.validate_digit_string(new.digits, r.digit_length);

  select user_id into opp_uid
  from public.room_members
  where room_id = new.room_id and user_id <> new.guesser_id
  limit 1;
  if opp_uid is null then
    raise exception 'opponent not found';
  end if;

  select digits into opp_secret from public.room_secrets where room_id = new.room_id and user_id = opp_uid;
  if opp_secret is null then
    raise exception 'opponent secret missing';
  end if;

  select * into hb from public.compute_hit_blow(opp_secret, new.digits, r.digit_length);
  new.hit := hb.hit;
  new.blow := hb.blow;

  return new;
end;
$$;

create trigger guesses_before_insert
  before insert on public.guesses
  for each row execute function public.guesses_before_insert();

create or replace function public.guesses_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms%rowtype;
  opp_uid uuid;
begin
  select * into r from public.rooms where id = new.room_id;
  if new.hit >= r.digit_length then
    update public.rooms
    set
      status = 'finished',
      winner_user_id = new.guesser_id,
      current_turn_user_id = null
    where id = new.room_id;
  else
    select user_id into opp_uid
    from public.room_members
    where room_id = new.room_id and user_id <> new.guesser_id
    limit 1;
    update public.rooms
    set current_turn_user_id = opp_uid
    where id = new.room_id;
  end if;
  return new;
end;
$$;

create trigger guesses_after_insert
  after insert on public.guesses
  for each row execute function public.guesses_after_insert();

-- --- RLS --------------------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_secrets enable row level security;
alter table public.guesses enable row level security;

create policy rooms_select on public.rooms
  for select to authenticated
  using (
    exists (
      select 1 from public.room_members m
      where m.room_id = rooms.id and m.user_id = (select auth.uid())
    )
  );

create policy rooms_insert on public.rooms
  for insert to authenticated
  with check ((select auth.uid()) is not null and created_by = (select auth.uid()));

create policy room_members_select on public.room_members
  for select to authenticated
  using (
    room_id in (select m.room_id from public.room_members m where m.user_id = (select auth.uid()))
  );

create policy room_members_insert on public.room_members
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.rooms r where r.id = room_id)
    and (select count(*)::int from public.room_members rm where rm.room_id = room_id) < 2
  );

create policy room_secrets_select on public.room_secrets
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy room_secrets_insert on public.room_secrets
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.room_members m
      where m.room_id = room_secrets.room_id and m.user_id = (select auth.uid())
    )
  );

create policy room_secrets_update on public.room_secrets
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.room_members m
      where m.room_id = room_secrets.room_id and m.user_id = (select auth.uid())
    )
  );

create policy guesses_select on public.guesses
  for select to authenticated
  using (
    exists (
      select 1 from public.room_members m
      where m.room_id = guesses.room_id and m.user_id = (select auth.uid())
    )
  );

create policy guesses_insert on public.guesses
  for insert to authenticated
  with check (
    guesser_id = (select auth.uid())
    and exists (
      select 1 from public.room_members m
      where m.room_id = guesses.room_id and m.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.rooms r
      where r.id = guesses.room_id
        and r.status = 'playing'
        and r.current_turn_user_id = (select auth.uid())
    )
  );

-- --- Realtime ---------------------------------------------------------------

alter publication supabase_realtime add table public.guesses;
alter publication supabase_realtime add table public.rooms;
