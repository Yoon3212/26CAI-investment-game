select pg_temp.test_assert(
  (select count(*) from stocks) = 7,
  '7 stocks seeded'
);

select pg_temp.test_assert(
  (select count(*) from rounds) = 10,
  '10 rounds seeded'
);

select pg_temp.test_assert(
  (select count(*) from stock_prices) = 70,
  '70 stock_prices rows seeded (7 stocks x 10 rounds)'
);

select pg_temp.test_assert(
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('game_state','participants','holdings')) = 3,
  'realtime publication includes game_state, participants, holdings'
);
