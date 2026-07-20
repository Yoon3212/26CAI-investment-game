begin;

update game_state set current_round = 1 where id = 1;

select pg_temp.test_assert(
  (select cash from join_game('신규조', 'pw1234')) = 1200000,
  'new nickname creates participant with seed cash'
);

update participants set cash = 999000 where nickname = '신규조';

select pg_temp.test_assert(
  (select cash from join_game('신규조', 'pw1234')) = 999000,
  'existing nickname + correct password returns the same participant (login) without resetting cash'
);

do $$
begin
  begin
    perform join_game('신규조', 'wrongpw');
    raise exception 'should not reach here: wrong password was accepted';
  exception when others then
    if sqlerrm not like '%비밀번호가 올바르지%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

update game_state set current_round = 12 where id = 1;

do $$
begin
  begin
    perform join_game('늦은조', 'pw1234');
    raise exception 'should not reach here: join after game end was allowed';
  exception when others then
    if sqlerrm not like '%종료%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
