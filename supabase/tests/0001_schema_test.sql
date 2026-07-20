begin;

select pg_temp.test_assert(
  (select current_round from game_state where id = 1) = 0,
  'game_state singleton starts at round 0'
);

insert into stocks (name, display_order) values ('테스트종목', 1);
insert into participants (nickname, cash) values ('테스트조', 1200000);

select pg_temp.test_assert(
  (select cash from participants where nickname = '테스트조') = 1200000,
  'participant created with seed cash'
);

select pg_temp.test_assert(
  (select count(*) from participants where nickname = 'TESTJO') = 0,
  'sanity: unrelated nickname lookup returns nothing'
);

do $$
begin
  begin
    insert into participants (nickname, cash) values ('테스트조', 1200000);
    raise exception 'should not reach here: duplicate nickname was allowed';
  exception when unique_violation then
    null;
  end;
end;
$$;

select pg_temp.test_assert(
  (select count(*) from participants where nickname = 'ㅌㅔ스트조') = 0,
  'sanity: citext is case-insensitive, not fuzzy (different string does not match)'
);

set local role anon;

select pg_temp.test_assert(
  (select count(*) from stocks) >= 1,
  'anon can read stocks table'
);

do $$
begin
  begin
    insert into stocks (name, display_order) values ('해킹종목', 99);
    raise exception 'should not reach here: anon insert was allowed';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select pg_temp.test_assert(
  (select count(*) from host_config) = 0,
  'anon sees zero rows from host_config (RLS enabled, no policies at all — SELECT silently filters rather than erroring)'
);

reset role;
rollback;
