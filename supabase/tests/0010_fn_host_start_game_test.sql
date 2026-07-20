begin;

update host_config set pin_hash = null where id = 1;
select set_host_pin('7777');

update game_state set current_round = 0 where id = 1;

select host_start_game('7777');

select pg_temp.test_assert(
  (select current_round from game_state where id = 1) = 1,
  'host_start_game moves round 0 to round 1'
);

select pg_temp.test_assert(
  (select is_paused from game_state where id = 1) = false,
  'game starts unpaused'
);

update game_state set current_round = 3 where id = 1;
do $$
begin
  begin
    perform host_start_game('7777');
    raise exception 'should not reach here: starting from round 3 was allowed';
  exception when others then
    if sqlerrm not like '%대기 상태%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
