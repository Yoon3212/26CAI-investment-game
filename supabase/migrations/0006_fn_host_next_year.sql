create or replace function host_next_year(p_pin text)
returns int
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

  if v_round < 1 or v_round >= 10 then
    raise exception '다음 해로 진행할 수 없는 라운드입니다 (현재: %)', v_round;
  end if;

  update participants p
  set cash = p.cash + coalesce(liq.proceeds, 0)
  from (
    select h.participant_id, sum(h.quantity * sp.price)::bigint as proceeds
    from holdings h
    join stock_prices sp on sp.stock_id = h.stock_id and sp.round = v_round + 1
    group by h.participant_id
  ) liq
  where p.id = liq.participant_id;

  delete from holdings where true;

  update game_state set current_round = v_round + 1, is_paused = false, updated_at = now() where id = 1;

  return v_round + 1;
end;
$$;
