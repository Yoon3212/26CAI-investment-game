create or replace function host_start_game(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_round int;
  v_pin_hash text;
begin
  select pin_hash into v_pin_hash from host_config where id = 1;
  if v_pin_hash is null or crypt(p_pin, v_pin_hash) <> v_pin_hash then
    raise exception '잘못된 진행자 PIN입니다';
  end if;

  select current_round into v_round from game_state where id = 1;
  if v_round <> 0 then
    raise exception '대기 상태(0)에서만 게임을 시작할 수 있습니다 (현재: %)', v_round;
  end if;

  update game_state set current_round = 1, is_paused = false, updated_at = now() where id = 1;
end;
$$;
