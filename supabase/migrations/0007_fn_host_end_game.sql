create or replace function host_end_game(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_round int;
  v_pin_hash text;
  v_year_label int;
begin
  select pin_hash into v_pin_hash from host_config where id = 1;
  if v_pin_hash is null or crypt(p_pin, v_pin_hash) <> v_pin_hash then
    raise exception '잘못된 진행자 PIN입니다';
  end if;

  select current_round into v_round from game_state where id = 1;
  if v_round <> 11 then
    raise exception '마지막 라운드(11)에서만 게임을 종료할 수 있습니다 (현재: %)', v_round;
  end if;

  select year_label into v_year_label from rounds where rounds.round = 11;

  insert into asset_history (round, year_label, participant_id, nickname, total_assets, round_profit)
  select
    11,
    v_year_label,
    p.id,
    p.nickname::text,
    p.cash + coalesce(liq.proceeds, 0),
    coalesce(liq.proceeds, 0) - coalesce(liq.cost_basis, 0)
  from participants p
  left join (
    select h.participant_id,
           sum(h.quantity * sp.price)::bigint as proceeds,
           sum(h.total_cost)::bigint as cost_basis
    from holdings h
    join stock_prices sp on sp.stock_id = h.stock_id and sp.round = 11
    group by h.participant_id
  ) liq on liq.participant_id = p.id
  on conflict (round, participant_id) do update
    set total_assets = excluded.total_assets, round_profit = excluded.round_profit, updated_at = now();

  update participants p
  set cash = p.cash + coalesce(liq.proceeds, 0)
  from (
    select h.participant_id, sum(h.quantity * sp.price)::bigint as proceeds
    from holdings h
    join stock_prices sp on sp.stock_id = h.stock_id and sp.round = 11
    group by h.participant_id
  ) liq
  where p.id = liq.participant_id;

  delete from holdings where true;

  update game_state set current_round = 12, is_paused = false, updated_at = now() where id = 1;
end;
$$;
