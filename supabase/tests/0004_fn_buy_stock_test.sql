begin;

insert into stocks (id, name, display_order) overriding system value values (901, '테스트종목', 1);
insert into rounds (round, year_label) values (1, 2016);
insert into stock_prices (stock_id, round, price) values (901, 1, 10000);
insert into participants (nickname, cash) values ('바이테스트', 1200000);

update game_state set current_round = 1, is_paused = false where id = 1;

select pg_temp.test_assert(
  (select count(*) from buy_stock('바이테스트', 901, 5)) = 1,
  'buy_stock succeeds for affordable quantity'
);

select pg_temp.test_assert(
  (select cash from participants where nickname = '바이테스트') = 1200000 - 5*10000,
  'cash decreased by price * quantity'
);

select pg_temp.test_assert(
  (select quantity from holdings where stock_id = 901 and participant_id = (select id from participants where nickname = '바이테스트')) = 5,
  'holdings recorded correct quantity'
);

select * from buy_stock('바이테스트', 901, 2);

select pg_temp.test_assert(
  (select quantity from holdings where stock_id = 901 and participant_id = (select id from participants where nickname = '바이테스트')) = 7,
  'a second buy of the same stock accumulates quantity instead of overwriting'
);

do $$
begin
  begin
    perform buy_stock('바이테스트', 901, 10000);
    raise exception 'should not reach here: overspend was allowed';
  exception when others then
    if sqlerrm not like '%현금이 부족%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

update game_state set is_paused = true where id = 1;
do $$
begin
  begin
    perform buy_stock('바이테스트', 901, 1);
    raise exception 'should not reach here: buy during pause was allowed';
  exception when others then
    if sqlerrm not like '%일시정지%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
