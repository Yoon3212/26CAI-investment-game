create or replace function join_game(p_nickname text, p_password text)
returns table (id uuid, nickname text, cash bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_round int;
  v_existing participants%rowtype;
begin
  if trim(p_nickname) = '' then
    raise exception '닉네임을 입력해주세요';
  end if;

  if trim(p_password) = '' then
    raise exception '비밀번호를 입력해주세요';
  end if;

  select current_round into v_round from game_state where game_state.id = 1;
  if v_round = 12 then
    raise exception '게임이 이미 종료되었습니다';
  end if;

  select * into v_existing from participants where participants.nickname = trim(p_nickname);
  if found then
    if crypt(p_password, v_existing.password_hash) <> v_existing.password_hash then
      raise exception '비밀번호가 올바르지 않습니다';
    end if;
    return query select v_existing.id, v_existing.nickname::text, v_existing.cash;
    return;
  end if;

  return query
    insert into participants (nickname, cash, password_hash)
    values (trim(p_nickname), 1200000, crypt(p_password, gen_salt('bf')))
    returning participants.id, participants.nickname::text, participants.cash;
end;
$$;
