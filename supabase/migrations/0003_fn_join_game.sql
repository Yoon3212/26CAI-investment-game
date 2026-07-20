create or replace function join_game(p_nickname text)
returns table (id uuid, nickname text, cash bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round int;
  v_existing participants%rowtype;
begin
  if trim(p_nickname) = '' then
    raise exception '닉네임을 입력해주세요';
  end if;

  select current_round into v_round from game_state where game_state.id = 1;
  if v_round = 11 then
    raise exception '게임이 이미 종료되었습니다';
  end if;

  select * into v_existing from participants where participants.nickname = trim(p_nickname);
  if found then
    return query select v_existing.id, v_existing.nickname::text, v_existing.cash;
    return;
  end if;

  return query
    insert into participants (nickname, cash)
    values (trim(p_nickname), 1200000)
    returning participants.id, participants.nickname::text, participants.cash;
end;
$$;
