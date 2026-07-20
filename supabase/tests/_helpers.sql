create or replace function pg_temp.test_assert(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if not condition then
    raise exception 'FAIL: %', message;
  else
    raise notice 'PASS: %', message;
  end if;
end;
$$;
