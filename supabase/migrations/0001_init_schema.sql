create extension if not exists citext;
create extension if not exists pgcrypto;

create table game_state (
  id int primary key default 1 check (id = 1),
  current_round int not null default 0 check (current_round between 0 and 12),
  is_paused boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into game_state (id, current_round, is_paused) values (1, 0, false);

create table stocks (
  id int primary key generated always as identity,
  name text not null,
  display_order int not null
);

create table rounds (
  round int primary key check (round between 1 and 11),
  year_label int not null
);

create table stock_prices (
  stock_id int not null references stocks(id),
  round int not null references rounds(round),
  price int not null check (price > 0),
  primary key (stock_id, round)
);

create table host_config (
  id int primary key default 1 check (id = 1),
  pin_hash text
);
insert into host_config (id, pin_hash) values (1, null);

create table participants (
  id uuid primary key default gen_random_uuid(),
  nickname citext not null unique,
  cash bigint not null default 1200000 check (cash >= 0),
  created_at timestamptz not null default now()
);

create table holdings (
  participant_id uuid not null references participants(id) on delete cascade,
  stock_id int not null references stocks(id),
  quantity int not null check (quantity > 0),
  primary key (participant_id, stock_id)
);

alter table game_state enable row level security;
alter table stocks enable row level security;
alter table rounds enable row level security;
alter table stock_prices enable row level security;
alter table participants enable row level security;
alter table holdings enable row level security;
alter table host_config enable row level security;

create policy "public read game_state" on game_state for select using (true);
create policy "public read stocks" on stocks for select using (true);
create policy "public read rounds" on rounds for select using (true);
create policy "public read stock_prices" on stock_prices for select using (true);
create policy "public read participants" on participants for select using (true);
create policy "public read holdings" on holdings for select using (true);
-- host_config has no policies at all: anon/authenticated get zero access.
-- Table owner (the role applying this migration) is exempt from RLS by
-- default, so the SECURITY DEFINER RPC functions in later tasks can still
-- read/write every table above despite these read-only policies.
