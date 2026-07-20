create or replace function buy_stock(p_nickname text, p_stock_id int, p_quantity int)
returns table (participant_id uuid, cash bigint, stock_id int, quantity int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant participants%rowtype;
  v_round int;
  v_paused boolean;
  v_price int;
  v_cost bigint;
begin
  if p_quantity <= 0 then
    raise exception '수량은 1 이상이어야 합니다';
  end if;

  select current_round, is_paused into v_round, v_paused from game_state where id = 1;

  if v_paused then
    raise exception '거래가 일시정지되었습니다';
  end if;

  if v_round < 1 or v_round > 11 then
    raise exception '현재 매수할 수 있는 라운드가 아닙니다';
  end if;

  select * into v_participant from participants where nickname = p_nickname;
  if not found then
    raise exception '참가자를 찾을 수 없습니다: %', p_nickname;
  end if;

  select price into v_price from stock_prices where stock_prices.stock_id = p_stock_id and stock_prices.round = v_round;
  if not found then
    raise exception '종목 가격 정보를 찾을 수 없습니다';
  end if;

  v_cost := v_price::bigint * p_quantity;

  if v_cost > v_participant.cash then
    raise exception '현금이 부족합니다 (필요: %, 보유: %)', v_cost, v_participant.cash;
  end if;

  update participants set cash = participants.cash - v_cost where participants.id = v_participant.id;

  begin
    insert into holdings (participant_id, stock_id, quantity)
    values (v_participant.id, p_stock_id, p_quantity);
  exception when unique_violation then
    update holdings
    set quantity = holdings.quantity + p_quantity
    where holdings.participant_id = v_participant.id and holdings.stock_id = p_stock_id;
  end;

  return query
    select v_participant.id, (v_participant.cash - v_cost), p_stock_id, p_quantity;
end;
$$;
