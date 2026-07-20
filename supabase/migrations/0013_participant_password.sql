-- Nickname is the login key, but anyone could type someone else's
-- nickname and see/trade on their account. Adds a per-participant
-- password (bcrypt-hashed, set on first join, checked on every
-- subsequent join) so only the person who created a nickname can
-- come back to it.
alter table participants add column password_hash text not null default '';

-- The default "public read" table-level grant covers every column,
-- including password_hash. Narrow it: revoke the blanket grant, then
-- re-grant only the columns the app actually needs to read directly.
revoke select on participants from anon, authenticated;
grant select (id, nickname, cash, created_at) on participants to anon, authenticated;
