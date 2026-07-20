begin;

update host_config set pin_hash = null where id = 1;
select set_host_pin('1111');

insert into stocks (id, name, display_order) overriding system value values (902, '넥스트종목', 1);
insert into rounds (round, year_label) values (1, 2016), (2, 2017);
insert into stock_prices (stock_id, round, price) values (902, 1, 10000), (902, 2, 15000);

insert into participants (nickname, cash) values ('넥스트조', 1200000);
update game_state set current_round = 1, is_paused = false where id = 1;

select * from buy_stock('넥스트조', 902, 10);

select pg_temp.test_assert(
  (select cash from participants where nickname = '넥스트조') = 1200000 - 10*10000,
  'sanity: purchase spent the expected cash before rollover'
);

select pg_temp.test_assert(
  host_next_year('1111') = 2,
  'host_next_year returns the new round number'
);

select pg_temp.test_assert(
  (select current_round from game_state where id = 1) = 2,
  'game_state advanced to round 2'
);

select pg_temp.test_assert(
  (select cash from participants where nickname = '넥스트조') = (1200000 - 10*10000) + 10*15000,
  'holdings liquidated at the NEW round price and added to cash'
);

select pg_temp.test_assert(
  (select count(*) from holdings where participant_id = (select id from participants where nickname = '넥스트조')) = 0,
  'holdings cleared after liquidation'
);

update game_state set current_round = 11 where id = 1;
do $$
begin
  begin
    perform host_next_year('1111');
    raise exception 'should not reach here: advancing past round 11 was allowed';
  exception when others then
    if sqlerrm not like '%진행할 수 없는%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
