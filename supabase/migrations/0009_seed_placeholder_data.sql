-- PLACEHOLDER DATA. Replace this entire file once the real 7 stock names
-- and 2016-2026 price series are provided — do not build on these values.
insert into stocks (name, display_order) values
  ('종목1', 1), ('종목2', 2), ('종목3', 3), ('종목4', 4),
  ('종목5', 5), ('종목6', 6), ('종목7', 7);

insert into rounds (round, year_label) values
  (1, 2016), (2, 2017), (3, 2018), (4, 2019), (5, 2020),
  (6, 2021), (7, 2022), (8, 2023), (9, 2024), (10, 2025);

insert into stock_prices (stock_id, round, price)
select s.id, r.round,
  (5000 + (s.id * 1000) + (r.round * 700) + ((s.id * r.round * 37) % 900))::int
from stocks s cross join rounds r;

alter publication supabase_realtime add table game_state, participants, holdings;
