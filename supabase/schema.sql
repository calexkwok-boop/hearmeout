create table if not exists public.rooms (
  code text primary key,
  host_id text not null,
  current_phase text not null default 'lobby',
  round integer not null default 0,
  category text not null default 'Food Wars',
  prompt text,
  answer_order jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.players (
  room_code text not null references public.rooms(code) on delete cascade,
  id text not null,
  name text not null,
  emoji text not null,
  is_host boolean not null default false,
  joined_at timestamptz not null default timezone('utc', now()),
  primary key (room_code, id)
);

create table if not exists public.answers (
  room_code text not null references public.rooms(code) on delete cascade,
  round integer not null,
  player_id text not null,
  answer text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (room_code, round, player_id)
);

create table if not exists public.votes (
  room_code text not null references public.rooms(code) on delete cascade,
  round integer not null,
  player_id text not null,
  target_player_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (room_code, round, player_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at
before update on public.rooms
for each row
execute function public.set_updated_at();

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.answers enable row level security;
alter table public.votes enable row level security;

drop policy if exists "demo rooms are readable" on public.rooms;
create policy "demo rooms are readable"
on public.rooms
for select
to anon, authenticated
using (true);

drop policy if exists "demo rooms are writable" on public.rooms;
create policy "demo rooms are writable"
on public.rooms
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "demo players are readable" on public.players;
create policy "demo players are readable"
on public.players
for select
to anon, authenticated
using (true);

drop policy if exists "demo players are writable" on public.players;
create policy "demo players are writable"
on public.players
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "demo answers are readable" on public.answers;
create policy "demo answers are readable"
on public.answers
for select
to anon, authenticated
using (true);

drop policy if exists "demo answers are writable" on public.answers;
create policy "demo answers are writable"
on public.answers
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "demo votes are readable" on public.votes;
create policy "demo votes are readable"
on public.votes
for select
to anon, authenticated
using (true);

drop policy if exists "demo votes are writable" on public.votes;
create policy "demo votes are writable"
on public.votes
for all
to anon, authenticated
using (true)
with check (true);

create index if not exists players_room_code_idx on public.players(room_code);
create index if not exists answers_room_round_idx on public.answers(room_code, round);
create index if not exists votes_room_round_idx on public.votes(room_code, round);
