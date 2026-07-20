begin;

update host_config set pin_hash = null where id = 1;
select set_host_pin('2222');

insert into stocks (id, name, display_order) overriding system value values (903, '엔드종목', 1);
insert into rounds (round, year_label)
  values (1,2016),(2,2017),(3,2018),(4,2019),(5,2020),(6,2021),(7,2022),(8,2023),(9,2024),(10,2025);
insert into stock_prices (stock_id, round, price) values (903, 10, 20000);

insert into participants (nickname, cash) values ('엔드조', 1200000);
update game_state set current_round = 10, is_paused = false where id = 1;

insert into holdings (participant_id, stock_id, quantity)
  values ((select id from participants where nickname = '엔드조'), 903, 3);
update participants set cash = 1200000 - 3*20000 where nickname = '엔드조';

select host_end_game('2222');

select pg_temp.test_assert(
  (select current_round from game_state where id = 1) = 11,
  'game_state marked as ended (round 11)'
);

select pg_temp.test_assert(
  (select cash from participants where nickname = '엔드조') = 1200000,
  'final holdings liquidated at round 10 price back to the original cash'
);

select pg_temp.test_assert(
  (select count(*) from holdings where participant_id = (select id from participants where nickname = '엔드조')) = 0,
  'holdings cleared after final liquidation'
);

update game_state set current_round = 5 where id = 1;
do $$
begin
  begin
    perform host_end_game('2222');
    raise exception 'should not reach here: ending game before round 10 was allowed';
  exception when others then
    if sqlerrm not like '%마지막 라운드%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
