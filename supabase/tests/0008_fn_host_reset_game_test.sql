begin;

update host_config set pin_hash = null where id = 1;
select set_host_pin('3333');

insert into stocks (id, name, display_order) overriding system value values (904, '리셋종목', 1);
insert into rounds (round, year_label) values (1, 2016);
insert into stock_prices (stock_id, round, price) values (904, 1, 5000);
insert into participants (nickname, cash) values ('리셋조', 1200000);
update game_state set current_round = 1 where id = 1;
select * from buy_stock('리셋조', 904, 2);

select host_reset_game('3333');

select pg_temp.test_assert(
  (select count(*) from participants) = 0,
  'all participants removed after reset'
);

select pg_temp.test_assert(
  (select count(*) from holdings) = 0,
  'all holdings removed after reset'
);

select pg_temp.test_assert(
  (select current_round from game_state where id = 1) = 0 and (select is_paused from game_state where id = 1) = false,
  'game_state reset to round 0, unpaused'
);

rollback;
