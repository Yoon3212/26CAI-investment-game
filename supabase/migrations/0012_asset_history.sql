-- Tracks cost basis per holding (needed to compute realized profit on
-- liquidation) and a per-round snapshot of each participant's total
-- assets + that round's realized profit, for the /display cumulative
-- asset chart and the participant screen's "직전 거래 수익" figure.
alter table holdings add column total_cost bigint not null default 0;

create table asset_history (
  round int not null references rounds(round),
  year_label int not null,
  participant_id uuid not null references participants(id) on delete cascade,
  nickname citext not null,
  total_assets bigint not null,
  round_profit bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (round, participant_id)
);

alter table asset_history enable row level security;
create policy "public read asset_history" on asset_history for select using (true);
