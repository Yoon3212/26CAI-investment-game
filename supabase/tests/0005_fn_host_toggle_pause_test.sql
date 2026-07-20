begin;

update host_config set pin_hash = null where id = 1;

select set_host_pin('4321');

select pg_temp.test_assert(
  host_toggle_pause('4321', true) = true,
  'toggle_pause returns the new paused state'
);

select pg_temp.test_assert(
  (select is_paused from game_state where id = 1) = true,
  'game_state.is_paused updated to true'
);

select host_toggle_pause('4321', false);

select pg_temp.test_assert(
  (select is_paused from game_state where id = 1) = false,
  'game_state.is_paused updated to false'
);

do $$
begin
  begin
    perform host_toggle_pause('0000', true);
    raise exception 'should not reach here: wrong pin was accepted';
  exception when others then
    if sqlerrm not like '%PIN%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
