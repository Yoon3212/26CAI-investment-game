create or replace function host_toggle_pause(p_pin text, p_paused boolean)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin_hash text;
begin
  select pin_hash into v_pin_hash from host_config where id = 1;
  if v_pin_hash is null or crypt(p_pin, v_pin_hash) <> v_pin_hash then
    raise exception '잘못된 진행자 PIN입니다';
  end if;

  update game_state set is_paused = p_paused, updated_at = now() where id = 1;
  return p_paused;
end;
$$;
