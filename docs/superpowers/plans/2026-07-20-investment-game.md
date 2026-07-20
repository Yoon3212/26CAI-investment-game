# 모의 투자 레크리에이션 웹앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a login-free mock investment recreation game (7 stocks, 10 yearly rounds, buy-only trading with automatic year-end liquidation) backed by Supabase and deployed as a static site on Cloudflare Pages.

**Architecture:** A Vite + React + TypeScript SPA with three routes (`/` participant, `/host` PIN-gated control panel, `/display` public leaderboard) talks directly to Supabase Postgres via `@supabase/supabase-js`. All game rules (buying, year rollover with auto-liquidation, pause, reset) live in Postgres `SECURITY DEFINER` RPC functions so a tampered client can never bypass them; RLS locks every table to read-only for the anon role.

**Tech Stack:** Vite 5, React 18, TypeScript 5, react-router-dom 6, @supabase/supabase-js 2, Supabase Postgres (citext, pgcrypto extensions), Cloudflare Pages (static hosting, no Workers/Functions needed).

## Global Constraints

- Participants can only **buy** (integer share units, 1주 단위). There is no participant-facing sell action — all liquidation happens automatically inside `host_next_year` / `host_end_game`.
- 10 rounds total. Internally modeled as `rounds.round` (1–10) with a separate `rounds.year_label` display column — do **not** derive the calendar year by arithmetic from the round number (2016–2026 is 11 calendar years for 10 rounds, which is an off-by-one trap). Real year labels and the 7 stock names/prices will be supplied later; until then, seed data is clearly marked placeholder.
- Every table has RLS enabled with SELECT-only policies for anon/authenticated. All writes happen exclusively through `SECURITY DEFINER` RPC functions — never add a client-side INSERT/UPDATE/DELETE against these tables.
- Host actions (`host_next_year`, `host_end_game`, `host_toggle_pause`, `host_reset_game`) take a `p_pin text` argument and verify it server-side against a bcrypt hash in `host_config` (via pgcrypto). Never store the PIN in plaintext or in frontend code.
- On this Supabase project, `pgcrypto` functions (`crypt`, `gen_salt`) live in the `extensions` schema, not `public`. Any RPC that calls them needs `set search_path = public, extensions` (not just `public`) — discovered while implementing Task 4 (`set_host_pin`) and applied there and to every host_* RPC that calls `crypt()`.
- Functions declared `returns table (...)` create OUT-parameter-like names matching the return column list, which shadow bare column references of the same name inside the function body and cause "column reference is ambiguous" errors. `join_game` (Task 5) and `buy_stock` (Task 6) both hit this — qualify any WHERE/SET clause column with its table name whenever it matches one of the function's own return column names (e.g. `where participants.nickname = ...` not `where nickname = ...` when `nickname` is also a return column). The same ambiguity hits `ON CONFLICT (...)` — its target column list is checked against the same scope and cannot be table-qualified, so when a conflict column matches a return column (e.g. `participant_id` in `buy_stock`), rewrite the upsert as `INSERT ... ; EXCEPTION WHEN unique_violation THEN UPDATE ...` instead (confirmed by direct testing: this is a real Postgres behavior, not implementer error).
- Trading pause auto-clears (`is_paused = false`) whenever `host_next_year` runs — each new round starts open.
- Money is `bigint`/`int` (원, no decimals). Starting cash is 1,200,000.
- All SQL migrations and tests run via `node scripts/run-sql.mjs <file>` against the real Supabase Postgres instance (no local Docker stack assumed).
- **The `/` participant page (Task 16) must not be built freely.** Before writing/committing its final component code, present the proposed layout/flow to the user and get explicit approval, per their instruction. The task below includes a first-draft proposal — treat it as a starting point for that conversation, not a final artifact to ship unreviewed.

## Prerequisites (manual, one-time, not part of the task loop)

1. Node.js 18+ and npm installed locally. `npm install` also pulls in `pg` (used by `scripts/run-sql.mjs` to run migrations/tests without needing a psql install).
2. A Supabase project created at supabase.com. From **Settings → API**, copy the Project URL and `anon` public key. From **Settings → Database → Connection string**, use the **Session pooler** entry (host like `aws-<n>-<region>.pooler.supabase.com`, port 5432, user like `postgres.<project-ref>`) rather than the direct connection — Supabase's direct-connection host is IPv6-only and unreachable on IPv4-only networks.
3. Export the DB credentials as discrete env vars before running any DB task (avoids ever having to URL-encode special characters in the password):
   ```bash
   export PGHOST="aws-<n>-<region>.pooler.supabase.com"
   export PGPORT="5432"
   export PGUSER="postgres.<project-ref>"
   export PGPASSWORD="<your-db-password>"
   export PGDATABASE="postgres"
   ```
4. A Cloudflare account with Pages enabled (needed only for Task 17).

---

## Data Model Reference (target schema after Tasks 3–11)

```
game_state(id=1 PK, current_round int 0-11, is_paused bool, updated_at)
stocks(id PK, name, display_order)
rounds(round PK 1-10, year_label int)
stock_prices(stock_id FK, round FK, price int) PK(stock_id, round)
host_config(id=1 PK, pin_hash text)
participants(id uuid PK, nickname citext unique, cash bigint, created_at)
holdings(participant_id FK, stock_id FK, quantity int) PK(participant_id, stock_id)
```

---

### Task 1: Project scaffold (Vite + React + TypeScript)

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `public/_redirects`
- Create: `src/main.tsx`
- Create: `README.md`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a buildable Vite React app with `npm run dev` / `npm run build`; `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env var contract used by every later frontend task.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "26cai-investment-game",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.6"
  }
}
```

- [ ] **Step 2: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>모의 투자 레크리에이션</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules
dist
.env
.env.local
```

- [ ] **Step 6: Create `.env.example`**

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 7: Create `public/_redirects`** (Cloudflare Pages SPA fallback so `/host` and `/display` don't 404 on refresh)

```
/*    /index.html   200
```

- [ ] **Step 8: Create `src/main.tsx`** (App.tsx doesn't exist yet — this will fail to compile until Task 12; that's expected, this task only verifies `npm install` and tooling work)

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <p>scaffold ok</p>
  </React.StrictMode>,
)
```

- [ ] **Step 9: Create `README.md`**

```markdown
# 26CAI 모의 투자 레크리에이션

## 준비물
- Node.js 18+
- Supabase 프로젝트 (URL, anon key, DB 연결 정보 — Session pooler 권장, direct 연결은 IPv6 전용이라 막힐 수 있음)

## 로컬 개발
1. `npm install` (마이그레이션/테스트 실행용 `pg` 패키지 포함)
2. `.env.example`을 `.env`로 복사하고 Supabase URL/anon key 입력
3. DB 접속 정보를 환경변수로 export (마이그레이션/테스트 실행용, psql 불필요):
   ```bash
   export PGHOST="aws-<n>-<region>.pooler.supabase.com"
   export PGPORT="5432"
   export PGUSER="postgres.<project-ref>"
   export PGPASSWORD="<your-db-password>"
   export PGDATABASE="postgres"
   ```
4. `supabase/migrations/*.sql`을 번호 순서대로 적용:
   `node scripts/run-sql.mjs supabase/migrations/0001_init_schema.sql` (이후 파일도 동일하게 순서대로)
5. `npm run dev`

## 배포 (Cloudflare Pages)
Cloudflare 대시보드에서 이 저장소를 연결하고 Build command `npm run build`, Output directory `dist`로 설정. 환경변수에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 등록.
```

- [ ] **Step 10: Install and verify**

Run: `npm install && npm run dev -- --port 5173 &` then check it serves, or simply `npm run build` after Task 12 adds `App.tsx`. For now just verify install succeeds:
Run: `npm install`
Expected: exits 0, `node_modules/` created, no `ERESOLVE` errors.

- [ ] **Step 11: Commit**

```bash
git add package.json vite.config.ts tsconfig.json index.html .gitignore .env.example public/_redirects src/main.tsx README.md
git commit -m "chore: scaffold Vite+React+TS project"
```

---

### Task 2: Supabase client module and shared types

**Files:**
- Create: `src/lib/supabaseClient.ts`
- Create: `src/lib/types.ts`

**Interfaces:**
- Consumes: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env vars (Task 1)
- Produces: `supabase` client singleton; `GameState`, `Stock`, `StockPrice`, `Participant`, `Holding`, `LeaderboardEntry` types used by every hook/page task from here on.

- [ ] **Step 1: Create `src/lib/supabaseClient.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 환경변수가 설정되지 않았습니다')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 2: Create `src/lib/types.ts`**

```ts
export interface GameState {
  currentRound: number
  isPaused: boolean
}

export interface Stock {
  id: number
  name: string
  displayOrder: number
}

export interface StockPrice {
  stockId: number
  round: number
  price: number
}

export interface Participant {
  id: string
  nickname: string
  cash: number
}

export interface Holding {
  participantId: string
  stockId: number
  quantity: number
}

export interface LeaderboardEntry {
  nickname: string
  cash: number
  stockValue: number
  totalAssets: number
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `supabaseClient.ts` or `types.ts` (errors about missing `App.tsx`/routes are expected until later tasks — check specifically that these two new files produce zero diagnostics).

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabaseClient.ts src/lib/types.ts
git commit -m "feat: add Supabase client and shared types"
```

---

### Task 3: Core DB schema + RLS migration

**Files:**
- Create: `supabase/migrations/0001_init_schema.sql`
- Create: `supabase/tests/_helpers.sql`
- Create: `supabase/tests/0001_schema_test.sql`

**Interfaces:**
- Consumes: reachable PGHOST/PGUSER/PGPASSWORD env vars (Prerequisites)
- Produces: the full table set from the Data Model Reference, with RLS enabled and SELECT-only policies. Every later RPC task depends on these tables existing.

- [ ] **Step 1: Create `supabase/tests/_helpers.sql`** (session-local test assertion helper, auto-dropped when the node scripts/run-sql.mjs connection closes)

```sql
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
```

- [ ] **Step 2: Create `supabase/migrations/0001_init_schema.sql`**

```sql
create extension if not exists citext;
create extension if not exists pgcrypto;

create table game_state (
  id int primary key default 1 check (id = 1),
  current_round int not null default 0 check (current_round between 0 and 11),
  is_paused boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into game_state (id, current_round, is_paused) values (1, 0, false);

create table stocks (
  id int primary key generated always as identity,
  name text not null,
  display_order int not null
);

create table rounds (
  round int primary key check (round between 1 and 10),
  year_label int not null
);

create table stock_prices (
  stock_id int not null references stocks(id),
  round int not null references rounds(round),
  price int not null check (price > 0),
  primary key (stock_id, round)
);

create table host_config (
  id int primary key default 1 check (id = 1),
  pin_hash text
);
insert into host_config (id, pin_hash) values (1, null);

create table participants (
  id uuid primary key default gen_random_uuid(),
  nickname citext not null unique,
  cash bigint not null default 1200000 check (cash >= 0),
  created_at timestamptz not null default now()
);

create table holdings (
  participant_id uuid not null references participants(id) on delete cascade,
  stock_id int not null references stocks(id),
  quantity int not null check (quantity > 0),
  primary key (participant_id, stock_id)
);

alter table game_state enable row level security;
alter table stocks enable row level security;
alter table rounds enable row level security;
alter table stock_prices enable row level security;
alter table participants enable row level security;
alter table holdings enable row level security;
alter table host_config enable row level security;

create policy "public read game_state" on game_state for select using (true);
create policy "public read stocks" on stocks for select using (true);
create policy "public read rounds" on rounds for select using (true);
create policy "public read stock_prices" on stock_prices for select using (true);
create policy "public read participants" on participants for select using (true);
create policy "public read holdings" on holdings for select using (true);
-- host_config has no policies at all: anon/authenticated get zero access.
-- Table owner (the role applying this migration) is exempt from RLS by
-- default, so the SECURITY DEFINER RPC functions in later tasks can still
-- read/write every table above despite these read-only policies.
```

- [ ] **Step 3: Apply the migration**

Run: `node scripts/run-sql.mjs supabase/migrations/0001_init_schema.sql`
Expected: exits 0, prints `CREATE EXTENSION`, `CREATE TABLE` x7, `INSERT 0 1` x2, `ALTER TABLE` x7, `CREATE POLICY` x6.

- [ ] **Step 4: Create `supabase/tests/0001_schema_test.sql`**

```sql
begin;

select pg_temp.test_assert(
  (select current_round from game_state where id = 1) = 0,
  'game_state singleton starts at round 0'
);

insert into stocks (name, display_order) values ('테스트종목', 1);
insert into participants (nickname, cash) values ('테스트조', 1200000);

select pg_temp.test_assert(
  (select cash from participants where nickname = '테스트조') = 1200000,
  'participant created with seed cash'
);

select pg_temp.test_assert(
  (select count(*) from participants where nickname = 'TESTJO') = 0,
  'sanity: unrelated nickname lookup returns nothing'
);

do $$
begin
  begin
    insert into participants (nickname, cash) values ('테스트조', 1200000);
    raise exception 'should not reach here: duplicate nickname was allowed';
  exception when unique_violation then
    null;
  end;
end;
$$;

select pg_temp.test_assert(
  (select count(*) from participants where nickname = 'ㅌㅔ스트조') = 0,
  'sanity: citext is case-insensitive, not fuzzy (different string does not match)'
);

set local role anon;

select pg_temp.test_assert(
  (select count(*) from stocks) >= 1,
  'anon can read stocks table'
);

do $$
begin
  begin
    insert into stocks (name, display_order) values ('해킹종목', 99);
    raise exception 'should not reach here: anon insert was allowed';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select pg_temp.test_assert(
  (select count(*) from host_config) = 0,
  'anon sees zero rows from host_config (RLS enabled, no policies at all — SELECT silently filters rather than erroring)'
);

reset role;
rollback;
```

- [ ] **Step 5: Run the test**

Run: `node scripts/run-sql.mjs supabase/tests/_helpers.sql supabase/tests/0001_schema_test.sql`
Expected: exits 0. Output contains `NOTICE: PASS: ...` for each assertion and no `FAIL:` lines, ending in `ROLLBACK`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0001_init_schema.sql supabase/tests/_helpers.sql supabase/tests/0001_schema_test.sql
git commit -m "feat(db): initial schema with RLS locked to read-only"
```

---

### Task 4: RPC `set_host_pin`

**Files:**
- Create: `supabase/migrations/0002_fn_set_host_pin.sql`
- Create: `supabase/tests/0002_fn_set_host_pin_test.sql`

**Interfaces:**
- Consumes: `host_config` table (Task 3)
- Produces: `set_host_pin(p_new_pin text) returns void` — bootstraps the PIN once; every host_* RPC in later tasks checks `host_config.pin_hash` the same way.

- [ ] **Step 1: Create `supabase/migrations/0002_fn_set_host_pin.sql`**

```sql
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
```

- [ ] **Step 2: Apply**

Run: `node scripts/run-sql.mjs supabase/migrations/0002_fn_set_host_pin.sql`
Expected: exits 0, prints `CREATE FUNCTION`.

- [ ] **Step 3: Create `supabase/tests/0002_fn_set_host_pin_test.sql`**

```sql
begin;

update host_config set pin_hash = null where id = 1;

select set_host_pin('1234');

select pg_temp.test_assert(
  (select pin_hash from host_config where id = 1) is not null,
  'set_host_pin stores a hash'
);

select pg_temp.test_assert(
  crypt('1234', (select pin_hash from host_config where id = 1)) = (select pin_hash from host_config where id = 1),
  'stored hash matches the pin that was set'
);

do $$
begin
  begin
    perform set_host_pin('9999');
    raise exception 'should not reach here: re-setting pin was allowed';
  exception when others then
    if sqlerrm not like '%이미 설정%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `node scripts/run-sql.mjs supabase/tests/_helpers.sql supabase/tests/0002_fn_set_host_pin_test.sql`
Expected: exits 0, all `PASS:` notices, no `FAIL:`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_fn_set_host_pin.sql supabase/tests/0002_fn_set_host_pin_test.sql
git commit -m "feat(db): add set_host_pin bootstrap RPC"
```

---

### Task 5: RPC `join_game`

**Files:**
- Create: `supabase/migrations/0003_fn_join_game.sql`
- Create: `supabase/tests/0003_fn_join_game_test.sql`

**Interfaces:**
- Consumes: `participants`, `game_state` tables (Task 3)
- Produces: `join_game(p_nickname text) returns table(id uuid, nickname text, cash bigint)` — used by `ParticipantPage` (Task 16) as the nickname "login".

- [ ] **Step 1: Create `supabase/migrations/0003_fn_join_game.sql`**

```sql
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

  select current_round into v_round from game_state where id = 1;
  if v_round = 11 then
    raise exception '게임이 이미 종료되었습니다';
  end if;

  select * into v_existing from participants where nickname = trim(p_nickname);
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
```

- [ ] **Step 2: Apply**

Run: `node scripts/run-sql.mjs supabase/migrations/0003_fn_join_game.sql`
Expected: exits 0, prints `CREATE FUNCTION`.

- [ ] **Step 3: Create `supabase/tests/0003_fn_join_game_test.sql`**

```sql
begin;

update game_state set current_round = 1 where id = 1;

select pg_temp.test_assert(
  (select cash from join_game('신규조')) = 1200000,
  'new nickname creates participant with seed cash'
);

update participants set cash = 999000 where nickname = '신규조';

select pg_temp.test_assert(
  (select cash from join_game('신규조')) = 999000,
  'existing nickname returns the same participant (login) without resetting cash'
);

update game_state set current_round = 11 where id = 1;

do $$
begin
  begin
    perform join_game('늦은조');
    raise exception 'should not reach here: join after game end was allowed';
  exception when others then
    if sqlerrm not like '%종료%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `node scripts/run-sql.mjs supabase/tests/_helpers.sql supabase/tests/0003_fn_join_game_test.sql`
Expected: exits 0, all `PASS:`, no `FAIL:`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_fn_join_game.sql supabase/tests/0003_fn_join_game_test.sql
git commit -m "feat(db): add join_game RPC (nickname-as-login)"
```

---

### Task 6: RPC `buy_stock`

**Files:**
- Create: `supabase/migrations/0004_fn_buy_stock.sql`
- Create: `supabase/tests/0004_fn_buy_stock_test.sql`

**Interfaces:**
- Consumes: `participants`, `stock_prices`, `holdings`, `game_state` (Task 3)
- Produces: `buy_stock(p_nickname text, p_stock_id int, p_quantity int) returns table(participant_id uuid, cash bigint, stock_id int, quantity int)` — the only trading action available to participants; blocked when `is_paused`.

- [ ] **Step 1: Create `supabase/migrations/0004_fn_buy_stock.sql`**

```sql
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

  if v_round < 1 or v_round > 10 then
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
```

- [ ] **Step 2: Apply**

Run: `node scripts/run-sql.mjs supabase/migrations/0004_fn_buy_stock.sql`
Expected: exits 0, prints `CREATE FUNCTION`.

- [ ] **Step 3: Create `supabase/tests/0004_fn_buy_stock_test.sql`**

```sql
begin;

insert into stocks (id, name, display_order) overriding system value values (901, '테스트종목', 1);
insert into rounds (round, year_label) values (1, 2016);
insert into stock_prices (stock_id, round, price) values (901, 1, 10000);
insert into participants (nickname, cash) values ('바이테스트', 1200000);

update game_state set current_round = 1, is_paused = false where id = 1;

select pg_temp.test_assert(
  (select count(*) from buy_stock('바이테스트', 901, 5)) = 1,
  'buy_stock succeeds for affordable quantity'
);

select pg_temp.test_assert(
  (select cash from participants where nickname = '바이테스트') = 1200000 - 5*10000,
  'cash decreased by price * quantity'
);

select pg_temp.test_assert(
  (select quantity from holdings where stock_id = 901 and participant_id = (select id from participants where nickname = '바이테스트')) = 5,
  'holdings recorded correct quantity'
);

select * from buy_stock('바이테스트', 901, 2);

select pg_temp.test_assert(
  (select quantity from holdings where stock_id = 901 and participant_id = (select id from participants where nickname = '바이테스트')) = 7,
  'a second buy of the same stock accumulates quantity instead of overwriting'
);

do $$
begin
  begin
    perform buy_stock('바이테스트', 901, 10000);
    raise exception 'should not reach here: overspend was allowed';
  exception when others then
    if sqlerrm not like '%현금이 부족%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

update game_state set is_paused = true where id = 1;
do $$
begin
  begin
    perform buy_stock('바이테스트', 901, 1);
    raise exception 'should not reach here: buy during pause was allowed';
  exception when others then
    if sqlerrm not like '%일시정지%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `node scripts/run-sql.mjs supabase/tests/_helpers.sql supabase/tests/0004_fn_buy_stock_test.sql`
Expected: exits 0, all `PASS:`, no `FAIL:`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_fn_buy_stock.sql supabase/tests/0004_fn_buy_stock_test.sql
git commit -m "feat(db): add buy_stock RPC (buy-only trading)"
```

---

### Task 7: RPC `host_toggle_pause`

**Files:**
- Create: `supabase/migrations/0005_fn_host_toggle_pause.sql`
- Create: `supabase/tests/0005_fn_host_toggle_pause_test.sql`

**Interfaces:**
- Consumes: `host_config`, `game_state` (Task 3), `set_host_pin` (Task 4)
- Produces: `host_toggle_pause(p_pin text, p_paused boolean) returns boolean` — used by `HostPage` (Task 14) and enforced inside `buy_stock` (Task 6).

- [ ] **Step 1: Create `supabase/migrations/0005_fn_host_toggle_pause.sql`**

```sql
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
```

- [ ] **Step 2: Apply**

Run: `node scripts/run-sql.mjs supabase/migrations/0005_fn_host_toggle_pause.sql`
Expected: exits 0, prints `CREATE FUNCTION`.

- [ ] **Step 3: Create `supabase/tests/0005_fn_host_toggle_pause_test.sql`**

```sql
begin;

update host_config set pin_hash = null where id = 1;
select set_host_pin('4321');

select pg_temp.test_assert(
  host_toggle_pause('4321', true) = true,
  'toggle_pause returns the new paused state'
);

select pg_temp.test_assert(
  (select is_paused from game_state where id = 1) = true,
  'game_state.is_paused updated to true'
);

select host_toggle_pause('4321', false);

select pg_temp.test_assert(
  (select is_paused from game_state where id = 1) = false,
  'game_state.is_paused updated to false'
);

do $$
begin
  begin
    perform host_toggle_pause('0000', true);
    raise exception 'should not reach here: wrong pin was accepted';
  exception when others then
    if sqlerrm not like '%PIN%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `node scripts/run-sql.mjs supabase/tests/_helpers.sql supabase/tests/0005_fn_host_toggle_pause_test.sql`
Expected: exits 0, all `PASS:`, no `FAIL:`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_fn_host_toggle_pause.sql supabase/tests/0005_fn_host_toggle_pause_test.sql
git commit -m "feat(db): add host_toggle_pause RPC"
```

---

### Task 8: RPC `host_next_year`

**Files:**
- Create: `supabase/migrations/0006_fn_host_next_year.sql`
- Create: `supabase/tests/0006_fn_host_next_year_test.sql`

**Interfaces:**
- Consumes: `holdings`, `stock_prices`, `participants`, `game_state`, `host_config` (Task 3), `set_host_pin` (Task 4)
- Produces: `host_next_year(p_pin text) returns int` (the new round number) — auto-liquidates every participant's holdings at the newly revealed round's price, then advances the round and clears `is_paused`.

- [ ] **Step 1: Create `supabase/migrations/0006_fn_host_next_year.sql`**

```sql
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

  delete from holdings;

  update game_state set current_round = v_round + 1, is_paused = false, updated_at = now() where id = 1;

  return v_round + 1;
end;
$$;
```

- [ ] **Step 2: Apply**

Run: `node scripts/run-sql.mjs supabase/migrations/0006_fn_host_next_year.sql`
Expected: exits 0, prints `CREATE FUNCTION`.

- [ ] **Step 3: Create `supabase/tests/0006_fn_host_next_year_test.sql`**

```sql
begin;

update host_config set pin_hash = null where id = 1;
select set_host_pin('1111');

insert into stocks (id, name, display_order) overriding system value values (902, '넥스트종목', 1);
insert into rounds (round, year_label) values (1, 2016), (2, 2017);
insert into stock_prices (stock_id, round, price) values (902, 1, 10000), (902, 2, 15000);

insert into participants (nickname, cash) values ('넥스트조', 1200000);
update game_state set current_round = 1, is_paused = false where id = 1;

select * from buy_stock('넥스트조', 902, 10);

select pg_temp.test_assert(
  (select cash from participants where nickname = '넥스트조') = 1200000 - 10*10000,
  'sanity: purchase spent the expected cash before rollover'
);

select pg_temp.test_assert(
  host_next_year('1111') = 2,
  'host_next_year returns the new round number'
);

select pg_temp.test_assert(
  (select current_round from game_state where id = 1) = 2,
  'game_state advanced to round 2'
);

select pg_temp.test_assert(
  (select cash from participants where nickname = '넥스트조') = (1200000 - 10*10000) + 10*15000,
  'holdings liquidated at the NEW round price and added to cash'
);

select pg_temp.test_assert(
  (select count(*) from holdings where participant_id = (select id from participants where nickname = '넥스트조')) = 0,
  'holdings cleared after liquidation'
);

update game_state set current_round = 10 where id = 1;
do $$
begin
  begin
    perform host_next_year('1111');
    raise exception 'should not reach here: advancing past round 10 was allowed';
  exception when others then
    if sqlerrm not like '%진행할 수 없는%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `node scripts/run-sql.mjs supabase/tests/_helpers.sql supabase/tests/0006_fn_host_next_year_test.sql`
Expected: exits 0, all `PASS:`, no `FAIL:`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_fn_host_next_year.sql supabase/tests/0006_fn_host_next_year_test.sql
git commit -m "feat(db): add host_next_year RPC with auto-liquidation"
```

---

### Task 9: RPC `host_end_game`

**Files:**
- Create: `supabase/migrations/0007_fn_host_end_game.sql`
- Create: `supabase/tests/0007_fn_host_end_game_test.sql`

**Interfaces:**
- Consumes: same tables as Task 8
- Produces: `host_end_game(p_pin text) returns void` — final liquidation at round 10's price, marks `current_round = 11` (ended).

- [ ] **Step 1: Create `supabase/migrations/0007_fn_host_end_game.sql`**

```sql
create or replace function host_end_game(p_pin text)
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
  if v_round <> 10 then
    raise exception '마지막 라운드(10)에서만 게임을 종료할 수 있습니다 (현재: %)', v_round;
  end if;

  update participants p
  set cash = p.cash + coalesce(liq.proceeds, 0)
  from (
    select h.participant_id, sum(h.quantity * sp.price)::bigint as proceeds
    from holdings h
    join stock_prices sp on sp.stock_id = h.stock_id and sp.round = 10
    group by h.participant_id
  ) liq
  where p.id = liq.participant_id;

  delete from holdings;

  update game_state set current_round = 11, is_paused = false, updated_at = now() where id = 1;
end;
$$;
```

- [ ] **Step 2: Apply**

Run: `node scripts/run-sql.mjs supabase/migrations/0007_fn_host_end_game.sql`
Expected: exits 0, prints `CREATE FUNCTION`.

- [ ] **Step 3: Create `supabase/tests/0007_fn_host_end_game_test.sql`**

```sql
begin;

update host_config set pin_hash = null where id = 1;
select set_host_pin('2222');

insert into stocks (id, name, display_order) overriding system value values (903, '엔드종목', 1);
insert into rounds (round, year_label)
  values (1,2016),(2,2017),(3,2018),(4,2019),(5,2020),(6,2021),(7,2022),(8,2023),(9,2024),(10,2025);
insert into stock_prices (stock_id, round, price) values (903, 10, 20000);

insert into participants (nickname, cash) values ('엔드조', 1200000);
update game_state set current_round = 10, is_paused = false where id = 1;

insert into holdings (participant_id, stock_id, quantity)
  values ((select id from participants where nickname = '엔드조'), 903, 3);
update participants set cash = 1200000 - 3*20000 where nickname = '엔드조';

select host_end_game('2222');

select pg_temp.test_assert(
  (select current_round from game_state where id = 1) = 11,
  'game_state marked as ended (round 11)'
);

select pg_temp.test_assert(
  (select cash from participants where nickname = '엔드조') = 1200000,
  'final holdings liquidated at round 10 price back to the original cash'
);

select pg_temp.test_assert(
  (select count(*) from holdings where participant_id = (select id from participants where nickname = '엔드조')) = 0,
  'holdings cleared after final liquidation'
);

update game_state set current_round = 5 where id = 1;
do $$
begin
  begin
    perform host_end_game('2222');
    raise exception 'should not reach here: ending game before round 10 was allowed';
  exception when others then
    if sqlerrm not like '%마지막 라운드%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `node scripts/run-sql.mjs supabase/tests/_helpers.sql supabase/tests/0007_fn_host_end_game_test.sql`
Expected: exits 0, all `PASS:`, no `FAIL:`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_fn_host_end_game.sql supabase/tests/0007_fn_host_end_game_test.sql
git commit -m "feat(db): add host_end_game RPC (final liquidation)"
```

---

### Task 10: RPC `host_reset_game`

**Files:**
- Create: `supabase/migrations/0008_fn_host_reset_game.sql`
- Create: `supabase/tests/0008_fn_host_reset_game_test.sql`

**Interfaces:**
- Consumes: `participants`, `holdings`, `game_state`, `host_config` (Task 3), `set_host_pin` (Task 4), `buy_stock` (Task 6)
- Produces: `host_reset_game(p_pin text) returns void` — wipes participants/holdings and returns `game_state` to round 0, used to reuse the same deployed app for a new group.

- [ ] **Step 1: Create `supabase/migrations/0008_fn_host_reset_game.sql`**

```sql
create or replace function host_reset_game(p_pin text)
returns void
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

  delete from holdings;
  delete from participants;
  update game_state set current_round = 0, is_paused = false, updated_at = now() where id = 1;
end;
$$;
```

- [ ] **Step 2: Apply**

Run: `node scripts/run-sql.mjs supabase/migrations/0008_fn_host_reset_game.sql`
Expected: exits 0, prints `CREATE FUNCTION`.

- [ ] **Step 3: Create `supabase/tests/0008_fn_host_reset_game_test.sql`**

```sql
begin;

update host_config set pin_hash = null where id = 1;
select set_host_pin('3333');

insert into stocks (id, name, display_order) overriding system value values (904, '리셋종목', 1);
insert into rounds (round, year_label) values (1, 2016);
insert into stock_prices (stock_id, round, price) values (904, 1, 5000);
insert into participants (nickname, cash) values ('리셋조', 1200000);
update game_state set current_round = 1 where id = 1;
select * from buy_stock('리셋조', 904, 2);

select host_reset_game('3333');

select pg_temp.test_assert(
  (select count(*) from participants) = 0,
  'all participants removed after reset'
);

select pg_temp.test_assert(
  (select count(*) from holdings) = 0,
  'all holdings removed after reset'
);

select pg_temp.test_assert(
  (select current_round from game_state where id = 1) = 0 and (select is_paused from game_state where id = 1) = false,
  'game_state reset to round 0, unpaused'
);

rollback;
```

- [ ] **Step 4: Run the test**

Run: `node scripts/run-sql.mjs supabase/tests/_helpers.sql supabase/tests/0008_fn_host_reset_game_test.sql`
Expected: exits 0, all `PASS:`, no `FAIL:`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_fn_host_reset_game.sql supabase/tests/0008_fn_host_reset_game_test.sql
git commit -m "feat(db): add host_reset_game RPC"
```

---

### Task 11: Placeholder seed data + Realtime publication

**Files:**
- Create: `supabase/migrations/0009_seed_placeholder_data.sql`
- Create: `supabase/tests/0009_seed_test.sql`

**Interfaces:**
- Consumes: `stocks`, `rounds`, `stock_prices` (Task 3)
- Produces: 7 seeded stocks, 10 seeded rounds, 70 seeded prices (all placeholder — replace this file wholesale once the real 7 names and 2016–2026 prices are provided), plus `game_state`/`participants`/`holdings` added to the `supabase_realtime` publication so the frontend hooks in Tasks 13–16 receive live updates.

- [ ] **Step 1: Create `supabase/migrations/0009_seed_placeholder_data.sql`**

```sql
-- PLACEHOLDER DATA. Replace this entire file once the real 7 stock names
-- and 2016-2026 price series are provided — do not build on these values.
insert into stocks (name, display_order) values
  ('종목1', 1), ('종목2', 2), ('종목3', 3), ('종목4', 4),
  ('종목5', 5), ('종목6', 6), ('종목7', 7);

insert into rounds (round, year_label) values
  (1, 2016), (2, 2017), (3, 2018), (4, 2019), (5, 2020),
  (6, 2021), (7, 2022), (8, 2023), (9, 2024), (10, 2025);

insert into stock_prices (stock_id, round, price)
select s.id, r.round,
  (5000 + (s.id * 1000) + (r.round * 700) + ((s.id * r.round * 37) % 900))::int
from stocks s cross join rounds r;

alter publication supabase_realtime add table game_state, participants, holdings;
```

- [ ] **Step 2: Apply**

Run: `node scripts/run-sql.mjs supabase/migrations/0009_seed_placeholder_data.sql`
Expected: exits 0, prints `INSERT 0 7`, `INSERT 0 10`, `INSERT 0 70`, `ALTER PUBLICATION`.

- [ ] **Step 3: Create `supabase/tests/0009_seed_test.sql`**

```sql
select pg_temp.test_assert(
  (select count(*) from stocks) = 7,
  '7 stocks seeded'
);

select pg_temp.test_assert(
  (select count(*) from rounds) = 10,
  '10 rounds seeded'
);

select pg_temp.test_assert(
  (select count(*) from stock_prices) = 70,
  '70 stock_prices rows seeded (7 stocks x 10 rounds)'
);

select pg_temp.test_assert(
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('game_state','participants','holdings')) = 3,
  'realtime publication includes game_state, participants, holdings'
);
```

- [ ] **Step 4: Run the test**

Run: `node scripts/run-sql.mjs supabase/tests/_helpers.sql supabase/tests/0009_seed_test.sql`
Expected: exits 0, all `PASS:`, no `FAIL:`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_seed_placeholder_data.sql supabase/tests/0009_seed_test.sql
git commit -m "feat(db): seed placeholder stock/price data and enable realtime"
```

---

### Task 12: App shell, routing, and env wiring

**Files:**
- Modify: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/routes/ParticipantPage.tsx` (minimal stub — replaced in Task 16)
- Create: `src/routes/HostPage.tsx` (minimal stub — replaced in Task 14)
- Create: `src/routes/DisplayPage.tsx` (minimal stub — replaced in Task 15)

**Interfaces:**
- Consumes: `supabase` client (Task 2)
- Produces: three working routes (`/`, `/host`, `/display`) that later tasks fill in one at a time.

- [ ] **Step 1: Replace `src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
```

- [ ] **Step 2: Create `src/App.tsx`**

```tsx
import { Routes, Route } from 'react-router-dom'
import ParticipantPage from './routes/ParticipantPage'
import HostPage from './routes/HostPage'
import DisplayPage from './routes/DisplayPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ParticipantPage />} />
      <Route path="/host" element={<HostPage />} />
      <Route path="/display" element={<DisplayPage />} />
    </Routes>
  )
}
```

- [ ] **Step 3: Create `src/routes/ParticipantPage.tsx`**

```tsx
export default function ParticipantPage() {
  return <p>참가자 화면 준비 중</p>
}
```

- [ ] **Step 4: Create `src/routes/HostPage.tsx`**

```tsx
export default function HostPage() {
  return <p>진행자 화면 준비 중</p>
}
```

- [ ] **Step 5: Create `src/routes/DisplayPage.tsx`**

```tsx
export default function DisplayPage() {
  return <p>전광판 화면 준비 중</p>
}
```

- [ ] **Step 6: Manually verify routing**

Run: `npm run dev`
Expected: dev server starts (prints a `http://localhost:5173` URL). Open it in a browser — `/` shows "참가자 화면 준비 중", `/host` shows "진행자 화면 준비 중", `/display` shows "전광판 화면 준비 중". Stop the server (Ctrl+C) when confirmed.

- [ ] **Step 7: Commit**

```bash
git add src/main.tsx src/App.tsx src/routes/ParticipantPage.tsx src/routes/HostPage.tsx src/routes/DisplayPage.tsx
git commit -m "feat(fe): app shell with three routed stub pages"
```

---

### Task 13: `useGameState` and `useLeaderboard` hooks

**Files:**
- Create: `src/hooks/useGameState.ts`
- Create: `src/hooks/useLeaderboard.ts`

**Interfaces:**
- Consumes: `supabase` client (Task 2), `GameState`/`LeaderboardEntry` types (Task 2), `game_state`/`participants`/`holdings`/`stock_prices` tables with realtime enabled (Tasks 3, 11)
- Produces: `useGameState(): { gameState: GameState | null, loading: boolean }` and `useLeaderboard(currentRound: number): LeaderboardEntry[]`, consumed by Tasks 14, 15, 16.

- [ ] **Step 1: Create `src/hooks/useGameState.ts`**

```ts
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { GameState } from '../lib/types'

export function useGameState() {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      const { data, error } = await supabase
        .from('game_state')
        .select('current_round, is_paused')
        .eq('id', 1)
        .single()

      if (!active) return
      if (error) {
        console.error(error)
        setLoading(false)
        return
      }
      setGameState({ currentRound: data.current_round, isPaused: data.is_paused })
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel('game_state_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_state' },
        (payload) => {
          const row = payload.new as { current_round: number; is_paused: boolean }
          setGameState({ currentRound: row.current_round, isPaused: row.is_paused })
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  return { gameState, loading }
}
```

- [ ] **Step 2: Create `src/hooks/useLeaderboard.ts`**

```ts
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { LeaderboardEntry } from '../lib/types'

export function useLeaderboard(currentRound: number) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])

  useEffect(() => {
    let active = true

    async function load() {
      const round = Math.min(Math.max(currentRound, 1), 10)

      const [{ data: participants }, { data: holdings }, { data: prices }] = await Promise.all([
        supabase.from('participants').select('id, nickname, cash'),
        supabase.from('holdings').select('participant_id, stock_id, quantity'),
        supabase.from('stock_prices').select('stock_id, price').eq('round', round),
      ])

      if (!active || !participants) return

      const priceByStock = new Map((prices ?? []).map((p) => [p.stock_id, p.price]))

      const result: LeaderboardEntry[] = participants.map((p) => {
        const stockValue = (holdings ?? [])
          .filter((h) => h.participant_id === p.id)
          .reduce((sum, h) => sum + h.quantity * (priceByStock.get(h.stock_id) ?? 0), 0)

        return {
          nickname: p.nickname,
          cash: p.cash,
          stockValue,
          totalAssets: p.cash + stockValue,
        }
      })

      result.sort((a, b) => b.totalAssets - a.totalAssets)
      setEntries(result)
    }

    load()

    const channel = supabase
      .channel('leaderboard_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holdings' }, load)
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [currentRound])

  return entries
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `useGameState.ts` or `useLeaderboard.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useGameState.ts src/hooks/useLeaderboard.ts
git commit -m "feat(fe): add useGameState and useLeaderboard hooks"
```

---

### Task 14: Host control panel (`/host`)

**Files:**
- Modify: `src/routes/HostPage.tsx` (replace stub from Task 12)

**Interfaces:**
- Consumes: `useGameState` (Task 13), `supabase.rpc` for `host_next_year` / `host_end_game` / `host_toggle_pause` / `host_reset_game` (Tasks 6–10)
- Produces: the working `/host` screen.

- [ ] **Step 1: Replace `src/routes/HostPage.tsx`**

```tsx
import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useGameState } from '../hooks/useGameState'

export default function HostPage() {
  const { gameState, loading } = useGameState()
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function callHostRpc(fn: string, extraArgs: Record<string, unknown> = {}) {
    setMessage(null)
    const { error } = await supabase.rpc(fn, { p_pin: pin, ...extraArgs })
    setMessage(error ? `오류: ${error.message}` : '완료')
  }

  if (loading || !gameState) return <p>불러오는 중...</p>

  return (
    <main>
      <h1>진행자 화면</h1>
      <p>
        현재 라운드: {gameState.currentRound} / 거래 상태: {gameState.isPaused ? '일시정지' : '진행중'}
      </p>

      <label>
        PIN: <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
      </label>

      <div>
        <button
          onClick={() => callHostRpc('host_next_year')}
          disabled={gameState.currentRound < 1 || gameState.currentRound >= 10}
        >
          다음 해
        </button>
        <button onClick={() => callHostRpc('host_end_game')} disabled={gameState.currentRound !== 10}>
          게임 종료
        </button>
        <button onClick={() => callHostRpc('host_toggle_pause', { p_paused: !gameState.isPaused })}>
          {gameState.isPaused ? '거래 재개' : '거래 일시정지'}
        </button>
        <button onClick={() => callHostRpc('host_reset_game')}>새 게임 시작</button>
      </div>

      {message && <p>{message}</p>}
    </main>
  )
}
```

- [ ] **Step 2: Manually verify against the real Supabase project**

Run: `npm run dev`, open `/host`. Set a real PIN and bump the round for manual testing by writing small one-off `.sql` files and running them with `node scripts/run-sql.mjs` instead of `psql -c`, e.g.:

```bash
printf "select set_host_pin('YOUR_REAL_PIN');" > /tmp/set-pin.sql
node scripts/run-sql.mjs /tmp/set-pin.sql
printf "update game_state set current_round = 1 where id = 1;" > /tmp/bump-round.sql
node scripts/run-sql.mjs /tmp/bump-round.sql
```

Enter the same PIN in the UI. Click 새 게임 시작 → round shows 0. After bumping to round 1, refresh `/host`, click 거래 일시정지 → status flips to "일시정지" without a page reload (confirms realtime).
Expected: every button produces "완료" and the displayed round/pause state updates live.

- [ ] **Step 3: Commit**

```bash
git add src/routes/HostPage.tsx
git commit -m "feat(fe): implement host control panel"
```

---

### Task 15: Public leaderboard display (`/display`)

**Files:**
- Modify: `src/routes/DisplayPage.tsx` (replace stub from Task 12)

**Interfaces:**
- Consumes: `useGameState`, `useLeaderboard` (Task 13)
- Produces: the working `/display` screen, no auth required.

- [ ] **Step 1: Replace `src/routes/DisplayPage.tsx`**

```tsx
import { useGameState } from '../hooks/useGameState'
import { useLeaderboard } from '../hooks/useLeaderboard'

export default function DisplayPage() {
  const { gameState, loading } = useGameState()
  const entries = useLeaderboard(gameState?.currentRound ?? 0)

  if (loading || !gameState) return <p>불러오는 중...</p>

  return (
    <main>
      <h1>{gameState.currentRound === 11 ? '최종 순위' : `현재 라운드: ${gameState.currentRound}`}</h1>
      <ol>
        {entries.map((entry) => (
          <li key={entry.nickname}>
            {entry.nickname} — {entry.totalAssets.toLocaleString()}원
          </li>
        ))}
      </ol>
    </main>
  )
}
```

- [ ] **Step 2: Manually verify**

Run: `npm run dev`, open `/display` in one tab and `/host` in another. From `/host`, advance the round or use `node scripts/run-sql.mjs` (with a small one-off .sql file) to insert a test participant with holdings. Confirm `/display` updates its ranking without a manual refresh.
Expected: leaderboard reorders live as underlying data changes.

- [ ] **Step 3: Commit**

```bash
git add src/routes/DisplayPage.tsx
git commit -m "feat(fe): implement public leaderboard display"
```

---

### Task 16: Participant screen (`/`) — approved design, ready to implement

The user reviewed a visual mockup (join / trading-list / stock chart / game-over states) and approved it with one change: no "future rounds aren't shown" note text. This task implements that approved design exactly — it is no longer a draft to negotiate, transcribe it as specified below.

**Files:**
- Create: `src/components/BrandBar.tsx`
- Create: `src/components/StockPriceChart.tsx`
- Create: `src/routes/ParticipantPage.css`
- Modify: `src/routes/ParticipantPage.tsx` (replace stub from Task 12)

**Interfaces:**
- Consumes: `useGameState` (Task 13), `supabase.rpc('join_game', ...)` (Task 5), `supabase.rpc('buy_stock', ...)` (Task 6), `stocks`/`stock_prices`/`rounds`/`holdings` tables (Task 3, seeded in Task 11)
- Produces: the working `/` screen with three internal views (join, stock list, per-stock chart) plus a terminal "game ended" view.

- [ ] **Step 1: Create `src/components/BrandBar.tsx`**

```tsx
export default function BrandBar() {
  return (
    <div className="pp-brandbar">
      <span className="pp-mark">C</span>
      <span className="pp-word">
        CAI <b>거래소</b>
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/StockPriceChart.tsx`**

```tsx
interface PricePoint {
  round: number
  yearLabel: number
  price: number
}

interface StockPriceChartProps {
  series: PricePoint[]
}

const WIDTH = 380
const HEIGHT = 160
const PAD = 10

export default function StockPriceChart({ series }: StockPriceChartProps) {
  if (series.length === 0) return null

  const prices = series.map((p) => p.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const stepX = series.length > 1 ? (WIDTH - PAD * 2) / (series.length - 1) : 0

  const points = series.map((p, i) => ({
    x: PAD + i * stepX,
    y: PAD + (1 - (p.price - min) / range) * (HEIGHT - PAD * 2),
    ...p,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x},${HEIGHT} L${points[0].x},${HEIGHT} Z`

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label="종목 가격 추이 차트">
        <line x1="0" y1={PAD} x2={WIDTH} y2={PAD} stroke="var(--pp-line)" strokeWidth={1} />
        <line x1="0" y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} stroke="var(--pp-line)" strokeWidth={1} />
        <line x1="0" y1={HEIGHT - PAD} x2={WIDTH} y2={HEIGHT - PAD} stroke="var(--pp-line)" strokeWidth={1} />
        <path d={areaPath} fill="var(--pp-accent)" opacity={0.1} />
        <path
          d={linePath}
          fill="none"
          stroke="var(--pp-accent)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={p.round}
            cx={p.x}
            cy={p.y}
            r={i === points.length - 1 ? 6 : 3.5}
            fill={i === points.length - 1 ? 'var(--pp-accent)' : 'var(--pp-surface)'}
            stroke="var(--pp-accent)"
            strokeWidth={2}
          />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--pp-ink-dim)', padding: '0 4px' }}>
        {series.map((p) => (
          <span key={p.round}>{p.yearLabel}</span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/routes/ParticipantPage.css`**

```css
:root {
  --pp-bg: #f4f2ec;
  --pp-surface: #ffffff;
  --pp-surface-2: #ece8dd;
  --pp-ink: #1c1f1a;
  --pp-ink-dim: #5b6058;
  --pp-line: #d9d4c6;
  --pp-accent: #b8842e;
  --pp-accent-ink: #3a2a0f;
  --pp-buy: #2f6b4f;
  --pp-buy-ink: #eafaf0;
  --pp-loss: #b5453a;
  --pp-loss-bg: #f6e4e1;
  --pp-gain-bg: #e6f0e9;
  --pp-closed: #a23b2f;
  --pp-closed-bg: #f9e7e3;
}

@media (prefers-color-scheme: dark) {
  :root {
    --pp-bg: #14181a;
    --pp-surface: #1d2225;
    --pp-surface-2: #262c2f;
    --pp-ink: #ece8df;
    --pp-ink-dim: #9aa19a;
    --pp-line: #343b3d;
    --pp-accent: #d8a34c;
    --pp-accent-ink: #241a08;
    --pp-buy: #48a276;
    --pp-buy-ink: #0b1a12;
    --pp-loss: #e08579;
    --pp-loss-bg: #3a2320;
    --pp-gain-bg: #1c2b22;
    --pp-closed: #e08579;
    --pp-closed-bg: #3a2320;
  }
}

.pp-page {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--pp-surface);
  color: var(--pp-ink);
  font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
}

.pp-brandbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--pp-line);
}
.pp-brandbar .pp-mark {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--pp-accent);
  color: var(--pp-accent-ink);
  font-weight: 800;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pp-brandbar .pp-word { font-size: 14.5px; font-weight: 800; }
.pp-brandbar .pp-word b { color: var(--pp-accent); }

.pp-join { padding: 44px 28px; text-align: center; }
.pp-join .pp-kicker {
  font-size: 12px; letter-spacing: .12em; text-transform: uppercase;
  color: var(--pp-accent); font-weight: 700; margin-bottom: 10px;
}
.pp-join h1 { font-size: 22px; margin: 0 0 8px; text-wrap: balance; }
.pp-join .pp-sub { color: var(--pp-ink-dim); font-size: 14px; margin: 0 0 30px; }
.pp-join input {
  width: 100%; font-size: 17px; padding: 14px 16px; border-radius: 12px;
  border: 1.5px solid var(--pp-line); background: var(--pp-bg); color: var(--pp-ink);
  text-align: center; margin-bottom: 14px;
}
.pp-join button {
  width: 100%; font-size: 16px; font-weight: 700; padding: 14px;
  border-radius: 12px; border: none; background: var(--pp-accent);
  color: var(--pp-accent-ink); cursor: pointer;
}

.pp-header { padding: 14px 20px 16px; border-bottom: 1px solid var(--pp-line); }
.pp-header .pp-row1 { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.pp-header .pp-nick { font-size: 15px; font-weight: 700; }
.pp-round-badge {
  font-size: 12px; font-weight: 700; color: var(--pp-accent-ink);
  background: var(--pp-accent); padding: 3px 10px; border-radius: 999px;
}
.pp-cash-label { font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--pp-ink-dim); margin-bottom: 2px; }
.pp-cash-amount { font-variant-numeric: tabular-nums; font-size: 27px; font-weight: 700; }

.pp-banner-closed {
  margin: 14px 20px 0; background: var(--pp-closed-bg); color: var(--pp-closed);
  border-radius: 10px; padding: 10px 14px; font-size: 13px; font-weight: 700;
}

.pp-error { margin: 12px 20px 0; color: var(--pp-loss); font-size: 13px; }

.pp-listlabel {
  padding: 14px 20px 6px; font-size: 11.5px; letter-spacing: .06em;
  text-transform: uppercase; color: var(--pp-ink-dim); font-weight: 700;
}

.pp-stocklist { list-style: none; margin: 0; padding: 0 12px 20px; display: flex; flex-direction: column; gap: 6px; }
.pp-stock-row { border-radius: 12px; }
.pp-stock-row-main {
  display: grid; grid-template-columns: 30px 1fr auto; align-items: center;
  gap: 0 10px; padding: 10px 10px; cursor: pointer;
}
.pp-stock-row-main:hover { background: var(--pp-surface-2); }
.pp-avatar {
  width: 30px; height: 30px; border-radius: 9px; background: var(--pp-surface-2);
  color: var(--pp-ink-dim); font-weight: 800; font-size: 12px;
  display: flex; align-items: center; justify-content: center;
}
.pp-stock-name { font-size: 14.5px; font-weight: 700; }
.pp-stock-holding { font-size: 11.5px; color: var(--pp-buy); font-weight: 700; }
.pp-stock-pricecol { text-align: right; }
.pp-stock-price { font-variant-numeric: tabular-nums; font-size: 14px; font-weight: 700; }
.pp-delta {
  font-variant-numeric: tabular-nums; font-size: 11px; font-weight: 700;
  padding: 1px 6px; border-radius: 6px; display: inline-block; margin-top: 2px;
}
.pp-delta-up { color: var(--pp-buy); background: var(--pp-gain-bg); }
.pp-delta-down { color: var(--pp-loss); background: var(--pp-loss-bg); }

.pp-buyrow { display: flex; align-items: center; gap: 8px; padding: 8px 10px 12px 40px; }
.pp-buyrow input {
  width: 60px; text-align: center; font-variant-numeric: tabular-nums; font-size: 14px;
  padding: 8px 4px; border-radius: 8px; border: 1.5px solid var(--pp-line);
  background: var(--pp-surface); color: var(--pp-ink);
}
.pp-buyrow button.pp-buy {
  font-size: 13px; font-weight: 700; padding: 9px 16px; border-radius: 8px;
  border: none; background: var(--pp-buy); color: var(--pp-buy-ink); cursor: pointer;
}
.pp-buyrow button.pp-buy:disabled { background: var(--pp-line); color: var(--pp-ink-dim); cursor: not-allowed; }
.pp-buyrow button.pp-chartlink {
  margin-left: auto; font-size: 12px; font-weight: 700; color: var(--pp-accent);
  background: none; border: none; cursor: pointer;
}

.pp-chart-top { padding: 14px 20px 4px; }
.pp-chart-back { font-size: 12.5px; color: var(--pp-ink-dim); cursor: pointer; margin-bottom: 10px; background: none; border: none; padding: 0; }
.pp-chart-name { font-size: 19px; font-weight: 800; }
.pp-chart-price { font-variant-numeric: tabular-nums; font-size: 26px; font-weight: 800; margin-top: 4px; }
.pp-chart-buy { display: flex; align-items: center; gap: 10px; margin: 16px 20px 22px; }
.pp-chart-buy input {
  width: 70px; text-align: center; font-variant-numeric: tabular-nums; font-size: 14px;
  padding: 11px 4px; border-radius: 10px; border: 1.5px solid var(--pp-line);
  background: var(--pp-surface); color: var(--pp-ink);
}
.pp-chart-buy button {
  flex: 1; font-size: 14.5px; font-weight: 700; padding: 12px; border-radius: 10px;
  border: none; background: var(--pp-buy); color: var(--pp-buy-ink); cursor: pointer;
}
.pp-chart-buy button:disabled { background: var(--pp-line); color: var(--pp-ink-dim); cursor: not-allowed; }

.pp-ended { padding: 40px 28px; text-align: center; }
.pp-ended .pp-kicker {
  font-size: 12px; letter-spacing: .12em; text-transform: uppercase;
  color: var(--pp-accent); font-weight: 700; margin-bottom: 10px;
}
.pp-ended h1 { font-size: 21px; margin: 0 0 24px; }
.pp-final-amount { font-variant-numeric: tabular-nums; font-size: 32px; font-weight: 800; margin-bottom: 4px; }
.pp-final-label { font-size: 13px; color: var(--pp-ink-dim); }
```

- [ ] **Step 4: Replace `src/routes/ParticipantPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useGameState } from '../hooks/useGameState'
import BrandBar from '../components/BrandBar'
import StockPriceChart from '../components/StockPriceChart'
import type { Stock, StockPrice } from '../lib/types'
import './ParticipantPage.css'

interface Me {
  id: string
  nickname: string
  cash: number
}

interface RoundInfo {
  round: number
  yearLabel: number
}

type View = { name: 'list' } | { name: 'chart'; stockId: number }

export default function ParticipantPage() {
  const { gameState, loading } = useGameState()
  const [nicknameInput, setNicknameInput] = useState('')
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stocks, setStocks] = useState<Stock[]>([])
  const [prices, setPrices] = useState<StockPrice[]>([])
  const [rounds, setRounds] = useState<RoundInfo[]>([])
  const [holdings, setHoldings] = useState<Record<number, number>>({})
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [expandedStockId, setExpandedStockId] = useState<number | null>(null)
  const [view, setView] = useState<View>({ name: 'list' })

  useEffect(() => {
    if (!gameState || gameState.currentRound < 1 || gameState.currentRound > 10) return

    async function loadStocksAndPrices() {
      const [{ data: stockRows }, { data: priceRows }, { data: roundRows }] = await Promise.all([
        supabase.from('stocks').select('id, name, display_order').order('display_order'),
        supabase
          .from('stock_prices')
          .select('stock_id, round, price')
          .lte('round', gameState!.currentRound)
          .order('round'),
        supabase.from('rounds').select('round, year_label').lte('round', gameState!.currentRound).order('round'),
      ])
      setStocks((stockRows ?? []).map((s) => ({ id: s.id, name: s.name, displayOrder: s.display_order })))
      setPrices((priceRows ?? []).map((p) => ({ stockId: p.stock_id, round: p.round, price: p.price })))
      setRounds((roundRows ?? []).map((r) => ({ round: r.round, yearLabel: r.year_label })))
    }

    loadStocksAndPrices()
  }, [gameState?.currentRound])

  async function refreshHoldings(participantId: string) {
    const { data } = await supabase.from('holdings').select('stock_id, quantity').eq('participant_id', participantId)
    const map: Record<number, number> = {}
    for (const h of data ?? []) map[h.stock_id] = h.quantity
    setHoldings(map)
  }

  useEffect(() => {
    if (!me) return
    refreshHoldings(me.id)
  }, [me?.id, gameState?.currentRound])

  async function join() {
    setError(null)
    const { data, error } = await supabase.rpc('join_game', { p_nickname: nicknameInput }).single()
    if (error) {
      setError(error.message)
      return
    }
    setMe(data as Me)
  }

  async function buy(stockId: number) {
    if (!me) return
    const quantity = quantities[stockId] ?? 0
    if (quantity <= 0) return
    setError(null)
    const { error } = await supabase.rpc('buy_stock', {
      p_nickname: me.nickname,
      p_stock_id: stockId,
      p_quantity: quantity,
    })
    if (error) {
      setError(error.message)
      return
    }
    const { data } = await supabase.from('participants').select('id, nickname, cash').eq('id', me.id).single()
    if (data) setMe({ id: data.id, nickname: data.nickname, cash: data.cash })
    await refreshHoldings(me.id)
  }

  function priceForRound(stockId: number, round: number): number | undefined {
    return prices.find((p) => p.stockId === stockId && p.round === round)?.price
  }

  function yearLabelForRound(round: number): number | undefined {
    return rounds.find((r) => r.round === round)?.yearLabel
  }

  if (loading || !gameState) return <p>불러오는 중...</p>

  if (!me) {
    return (
      <main className="pp-page">
        <BrandBar />
        <div className="pp-join">
          <p className="pp-kicker">모의 투자 레크리에이션</p>
          <h1>닉네임으로 입장하세요</h1>
          <p className="pp-sub">같은 닉네임으로 다시 들어오면 이전 기록 그대로 이어집니다.</p>
          <input value={nicknameInput} onChange={(e) => setNicknameInput(e.target.value)} placeholder="예: 1조" />
          <button onClick={join}>입장하기</button>
          {error && <p className="pp-error">{error}</p>}
        </div>
      </main>
    )
  }

  if (gameState.currentRound === 11) {
    return (
      <main className="pp-page">
        <BrandBar />
        <div className="pp-ended">
          <p className="pp-kicker">게임 종료</p>
          <h1>10년간의 투자가 끝났습니다</h1>
          <p className="pp-final-amount">{me.cash.toLocaleString()}원</p>
          <p className="pp-final-label">{me.nickname}님의 최종 자산</p>
        </div>
      </main>
    )
  }

  if (view.name === 'chart') {
    const stock = stocks.find((s) => s.id === view.stockId)
    if (!stock) {
      return null
    }
    const currentPrice = priceForRound(stock.id, gameState.currentRound) ?? 0
    const prevPrice = priceForRound(stock.id, gameState.currentRound - 1)
    const delta = prevPrice !== undefined ? currentPrice - prevPrice : null
    const series = rounds.map((r) => ({
      round: r.round,
      yearLabel: r.yearLabel,
      price: priceForRound(stock.id, r.round) ?? 0,
    }))

    return (
      <main className="pp-page">
        <BrandBar />
        <div className="pp-chart-top">
          <button className="pp-chart-back" onClick={() => setView({ name: 'list' })}>
            ← 종목 리스트로
          </button>
          <div className="pp-chart-name">{stock.name}</div>
          <div className="pp-chart-price">{currentPrice.toLocaleString()}원</div>
          {delta !== null && (
            <span className={delta >= 0 ? 'pp-delta pp-delta-up' : 'pp-delta pp-delta-down'}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString()} (전 라운드 대비)
            </span>
          )}
        </div>
        <StockPriceChart series={series} />
        <div className="pp-chart-buy">
          <input
            type="number"
            min={1}
            value={quantities[stock.id] ?? ''}
            onChange={(e) => setQuantities((prev) => ({ ...prev, [stock.id]: Number(e.target.value) }))}
            disabled={gameState.isPaused}
          />
          <button onClick={() => buy(stock.id)} disabled={gameState.isPaused}>
            이 가격에 매수
          </button>
        </div>
        {error && <p className="pp-error">{error}</p>}
      </main>
    )
  }

  return (
    <main className="pp-page">
      <BrandBar />
      <div className="pp-header">
        <div className="pp-row1">
          <span className="pp-nick">{me.nickname}</span>
          <span className="pp-round-badge">
            {yearLabelForRound(gameState.currentRound) ?? ''}년 · {gameState.currentRound}라운드
          </span>
        </div>
        <div className="pp-cash-label">보유 현금</div>
        <div className="pp-cash-amount">{me.cash.toLocaleString()}원</div>
      </div>

      {gameState.isPaused && <p className="pp-banner-closed">장이 마감되었습니다. 진행자의 재개를 기다려주세요.</p>}
      {error && <p className="pp-error">{error}</p>}

      <p className="pp-listlabel">종목 (탭하여 매수)</p>
      <ul className="pp-stocklist">
        {stocks.map((stock) => {
          const price = priceForRound(stock.id, gameState.currentRound) ?? 0
          const prevPrice = priceForRound(stock.id, gameState.currentRound - 1)
          const delta = prevPrice !== undefined ? price - prevPrice : null
          const expanded = expandedStockId === stock.id
          const holdingQty = holdings[stock.id]

          return (
            <li key={stock.id} className="pp-stock-row">
              <div className="pp-stock-row-main" onClick={() => setExpandedStockId(expanded ? null : stock.id)}>
                <span className="pp-avatar">{stock.displayOrder}</span>
                <div>
                  <div className="pp-stock-name">{stock.name}</div>
                  {holdingQty ? <div className="pp-stock-holding">보유 {holdingQty}주</div> : null}
                </div>
                <div className="pp-stock-pricecol">
                  <div className="pp-stock-price">{price.toLocaleString()}원</div>
                  {delta !== null && (
                    <span className={delta >= 0 ? 'pp-delta pp-delta-up' : 'pp-delta pp-delta-down'}>
                      {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              {expanded && (
                <div className="pp-buyrow">
                  <input
                    type="number"
                    min={1}
                    value={quantities[stock.id] ?? ''}
                    onChange={(e) => setQuantities((prev) => ({ ...prev, [stock.id]: Number(e.target.value) }))}
                    disabled={gameState.isPaused}
                  />
                  <button className="pp-buy" onClick={() => buy(stock.id)} disabled={gameState.isPaused}>
                    매수
                  </button>
                  <button className="pp-chartlink" onClick={() => setView({ name: 'chart', stockId: stock.id })}>
                    차트 보기 →
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </main>
  )
}
```

- [ ] **Step 5: Manually verify**

Run: `npm run dev`, open `/`. Join with a nickname, confirm the brand bar ("CAI 거래소") shows on every internal view. Tap a stock row to expand the buy form, buy a stock, confirm cash decreases and "보유 N주" appears under that stock's name. Tap "차트 보기 →" and confirm the chart renders with year labels matching the revealed rounds and the current price/delta shown above it; buying from the chart view should behave identically to buying from the list. Collapse back to the list via "← 종목 리스트로". From `/host`, toggle 거래 일시정지 and confirm the participant screen shows the closed-market banner and disables both the list buy button and the chart buy button without a manual refresh. Advance 다음 해 from `/host` and confirm the participant's cash jumps by the liquidation amount, holdings reset to empty, and the round badge's year/round updates.
Expected: all of the above hold true against the real Supabase project.

- [ ] **Step 6: Commit**

```bash
git add src/components/BrandBar.tsx src/components/StockPriceChart.tsx src/routes/ParticipantPage.css src/routes/ParticipantPage.tsx
git commit -m "feat(fe): implement participant screen (buy-only, pause-aware, with price chart)"
```

---

### Task 17: Cloudflare Pages deployment

**Files:**
- Modify: `README.md` (append deployment section, already scaffolded in Task 1 — this fills in the details verified by hand)

**Interfaces:**
- Consumes: `dist/` build output (Task 1's `npm run build`), `public/_redirects` (Task 1)
- Produces: a live Cloudflare Pages URL serving all three routes.

- [ ] **Step 1: Verify a production build works locally**

Run: `npm run build`
Expected: exits 0, creates `dist/index.html` and `dist/_redirects` (copied from `public/`).

- [ ] **Step 2: Preview the production build**

Run: `npm run preview`
Expected: serves `dist/` locally; visiting `/host` and `/display` directly (not just via in-app navigation) loads correctly instead of 404ing, confirming `_redirects` works.

- [ ] **Step 3: Connect the repo in the Cloudflare Pages dashboard**

In the Cloudflare dashboard: Pages → Create project → connect this Git repository. Set:
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (same values as local `.env`)

Trigger a deploy and open the resulting `*.pages.dev` URL.
Expected: `/`, `/host`, `/display` all load correctly on the deployed URL.

- [ ] **Step 4: Append deployment notes to `README.md`**

Add under the existing "배포 (Cloudflare Pages)" section:

```markdown
확인된 배포 URL: <배포 후 실제 URL로 교체>

환경변수는 Cloudflare Pages 대시보드 → Settings → Environment variables에서 관리하며 `.env`는 커밋하지 않는다.
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add verified Cloudflare Pages deployment notes"
```

---

### Task 18: End-to-end manual QA pass

**Files:**
- Create: `docs/superpowers/testing/2026-07-20-manual-qa-checklist.md`

**Interfaces:**
- Consumes: the fully deployed app (Tasks 1–17)
- Produces: a recorded pass/fail run of the full game flow, the final verification gate for this plan.

- [ ] **Step 1: Create `docs/superpowers/testing/2026-07-20-manual-qa-checklist.md`**

```markdown
# 수동 QA 체크리스트 — 모의 투자 레크리에이션

실행 전: `/host`에서 새 게임 시작으로 초기화.

- [ ] `/`에서 서로 다른 닉네임 2개 이상으로 입장, 각각 시드 1,200,000원 확인
- [ ] 같은 닉네임으로 새로고침 후 재입장 시 동일 현금/보유내역으로 복귀
- [ ] `/host`에서 라운드 1 상태에서 참가자가 종목 매수 가능 확인
- [ ] `/host`에서 거래 일시정지 → 참가자 화면에 장마감 메시지, 매수 버튼 비활성화
- [ ] `/host`에서 거래 재개 → 매수 다시 가능
- [ ] `/host`에서 다음 해 클릭 → 라운드 증가, 참가자의 이전 보유주식이 새 가격으로 현금 전환됨, 거래 일시정지 자동 해제 확인
- [ ] 다음 해를 반복해 라운드 10까지 진행
- [ ] `/host`에서 게임 종료 클릭 → 남은 보유주식이 청산되고 `/display`에 최종 순위 표시
- [ ] `/display`를 프로젝터 화면 크기로 열어 순위표가 실시간으로 갱신되는지 확인
- [ ] `/host`에서 새 게임 시작 → 참가자 목록/자산이 모두 초기화되고 라운드 0으로 복귀
```

- [ ] **Step 2: Execute the checklist against the deployed Cloudflare Pages URL and check off each item**

Run through the checklist manually in a browser (or multiple browser tabs/devices for multi-participant items).
Expected: every box can be checked with no unexpected errors; note and fix any failure before considering the plan complete.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/testing/2026-07-20-manual-qa-checklist.md
git commit -m "test: record manual QA checklist for full game flow"
```

---

### Task 19: Post-review fixes — `host_start_game` RPC + participant cash staleness

The final whole-branch review (after Task 16) found two Important gaps that block a clean unaided playthrough:

1. **No way to start the game.** `host_reset_game` leaves `game_state.current_round = 0`, `buy_stock` requires round 1–10, and `host_next_year` requires round 1–9 — nothing in the app moves the game from round 0 to round 1. Running a game currently requires direct DB access.
2. **Participant's own cash goes stale after liquidation.** `ParticipantPage`'s round-change effect only calls `refreshHoldings()`, never refetches the participant's `cash`. After the host clicks 다음 해, the player sees cleared holdings and new prices but stale pre-liquidation cash until their next buy. At game end (`currentRound === 11`) this means the "최종 자산" shown can be wrong for anyone who held stock at round 10.

**Files:**
- Create: `supabase/migrations/0010_fn_host_start_game.sql`
- Create: `supabase/tests/0010_fn_host_start_game_test.sql`
- Modify: `src/routes/HostPage.tsx` (add a "게임 시작" button)
- Modify: `src/routes/ParticipantPage.tsx` (refetch cash on round change, not just holdings)

**Interfaces:**
- Consumes: `host_config`, `game_state` (Task 3), `set_host_pin` (Task 4)
- Produces: `host_start_game(p_pin text) returns void` — moves `current_round` from 0 to 1. `HostPage` gets a new button calling it; `ParticipantPage` gets a `refreshMe` helper alongside the existing `refreshHoldings`.

- [ ] **Step 1: Create `supabase/migrations/0010_fn_host_start_game.sql`**

```sql
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
```

- [ ] **Step 2: Apply**

Run: `node scripts/run-sql.mjs supabase/migrations/0010_fn_host_start_game.sql`
Expected: exits 0, prints `CREATE FUNCTION`.

- [ ] **Step 3: Create `supabase/tests/0010_fn_host_start_game_test.sql`**

```sql
begin;

update host_config set pin_hash = null where id = 1;
select set_host_pin('7777');

update game_state set current_round = 0 where id = 1;

select host_start_game('7777');

select pg_temp.test_assert(
  (select current_round from game_state where id = 1) = 1,
  'host_start_game moves round 0 to round 1'
);

select pg_temp.test_assert(
  (select is_paused from game_state where id = 1) = false,
  'game starts unpaused'
);

update game_state set current_round = 3 where id = 1;
do $$
begin
  begin
    perform host_start_game('7777');
    raise exception 'should not reach here: starting from round 3 was allowed';
  exception when others then
    if sqlerrm not like '%대기 상태%' then
      raise exception 'unexpected error: %', sqlerrm;
    end if;
  end;
end;
$$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `node scripts/run-sql.mjs supabase/tests/_helpers.sql supabase/tests/0010_fn_host_start_game_test.sql`
Expected: exits 0, all `PASS:`, no `FAIL:`.

- [ ] **Step 5: Add a "게임 시작" button to `src/routes/HostPage.tsx`**

Add a new button, enabled only when `gameState.currentRound === 0`, alongside the existing four buttons (다음 해 / 게임 종료 / 거래 일시정지 / 새 게임 시작):

```tsx
<button onClick={() => callHostRpc('host_start_game')} disabled={gameState.currentRound !== 0}>
  게임 시작
</button>
```

Place it before the "다음 해" button in the JSX so the button order reads left-to-right as the game's lifecycle: 게임 시작 → 다음 해 → 게임 종료, with 거래 일시정지 / 새 게임 시작 after.

- [ ] **Step 6: Fix `src/routes/ParticipantPage.tsx` to refetch cash on round change**

Add a `refreshMe` function alongside the existing `refreshHoldings`, and call it from the same effect:

```tsx
async function refreshMe(participantId: string) {
  const { data } = await supabase
    .from('participants')
    .select('id, nickname, cash')
    .eq('id', participantId)
    .single()
  if (data) setMe({ id: data.id, nickname: data.nickname, cash: data.cash })
}
```

Change the existing effect:

```tsx
useEffect(() => {
  if (!me) return
  refreshHoldings(me.id)
}, [me?.id, gameState?.currentRound])
```

to also call `refreshMe`:

```tsx
useEffect(() => {
  if (!me) return
  refreshHoldings(me.id)
  refreshMe(me.id)
}, [me?.id, gameState?.currentRound])
```

This ensures cash is refetched from the server every time `currentRound` changes (i.e. every time the host advances a year or ends the game), fixing both the mid-game staleness and the wrong "최종 자산" at game end.

- [ ] **Step 7: Manually verify**

Run: `npx tsc --noEmit -p tsconfig.json` and `npm run build` — both must pass. If you can run the app against the real Supabase project, confirm: from a fresh `host_reset_game`, `/host` shows round 0 and a "게임 시작" button (only that one enabled among the round-progression buttons); clicking it with the correct PIN moves to round 1 and enables 다음 해; on `/`, join, buy a stock, have the host advance 다음 해, and confirm the participant's displayed cash updates to reflect the liquidation without needing another buy or a manual refresh.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0010_fn_host_start_game.sql supabase/tests/0010_fn_host_start_game_test.sql src/routes/HostPage.tsx src/routes/ParticipantPage.tsx
git commit -m "fix: add host_start_game RPC and refresh participant cash on round change"
```
