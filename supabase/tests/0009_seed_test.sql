select pg_temp.test_assert(
  (select count(*) from stocks) = 7,
  '7 stocks seeded'
);

select pg_temp.test_assert(
  (select count(*) from rounds) = 11,
  '11 rounds seeded'
);

select pg_temp.test_assert(
  (select count(*) from stock_prices) = 77,
  '77 stock_prices rows seeded (7 stocks x 11 rounds)'
);

select pg_temp.test_assert(
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('game_state','participants','holdings')) = 3,
  'realtime publication includes game_state, participants, holdings'
);
