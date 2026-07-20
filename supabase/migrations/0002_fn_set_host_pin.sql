create or replace function set_host_pin(p_new_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing text;
begin
  select pin_hash into v_existing from host_config where id = 1;
  if v_existing is not null then
    raise exception 'PIN이 이미 설정되어 있습니다';
  end if;
  if length(p_new_pin) < 4 then
    raise exception 'PIN은 4자리 이상이어야 합니다';
  end if;
  update host_config set pin_hash = crypt(p_new_pin, gen_salt('bf')) where id = 1;
end;
$$;
