begin;

update host_config set pin_hash = null where id = 1;

select set_host_pin('1234');

select pg_temp.test_assert(
  (select pin_hash from host_config where id = 1) is not null,
  'set_host_pin stores a hash'
);

select pg_temp.test_assert(
  crypt('1234', (select pin_hash from host_config where id = 1)) = (select pin_hash from host_config where id = 1),
  'stored hash matches the pin that was set'
);

do $$
begin
  begin
    perform set_host_pin('9999');
    raise exception 'should not reach here: re-setting pin was allowed';
  exception when others then
    if sqlerrm not like '%이미 설정%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
