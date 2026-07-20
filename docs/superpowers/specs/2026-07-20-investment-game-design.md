# 모의 투자 레크리에이션 웹앱 — 설계 문서

- 작성일: 2026-07-20
- 상태: 승인됨

## 배경 / 목적

7개 종목, 2016~2026년(10개 연도) 가격으로 진행하는 모의 투자 레크리에이션 게임. 참가자는 닉네임만으로 참여해 시드머니 1,200,000원으로 시작하고, 매 라운드(연도)마다 원하는 종목을 매수한다. 진행자가 "다음 해"를 누르면 그 해 주가가 공개되고, 참가자가 보유했던 모든 주식은 새 가격으로 자동 매도되어 현금으로 전환된다. 마지막 라운드가 끝나면 최종 자산 기준 순위표를 보여준다.

## 범위 확정 사항

- **단일 게임 구조**: 동시에 진행되는 게임은 항상 하나. 진행자가 "새 게임 시작"으로 언제든 초기화하고 재사용 가능.
- **라운드**: 2016~2026년, 총 10개 연도 고정. 가격 데이터는 추후 제공.
- **매매 방향**: 참가자는 **매수만** 가능. 매도 기능은 참가자에게 없으며, "다음 해" 전환 시 보유 주식 전량이 그 시점 가격으로 **자동** 현금화된다.
- **매매 단위**: 1주 단위 정수만. 소수/금액 단위 매수 없음.
- **참가자 식별**: 닉네임이 곧 로그인. 같은 닉네임으로 재접속하면 기존 계정(현금·보유주식)으로 복귀. 비밀번호 없음.
- **진행자 접근**: PIN 1개로 보호되는 `/host` 컨트롤 패널.
- **거래 일시정지**: 진행자가 라운드 중 언제든 거래를 일시정지/재개할 수 있다. 정지 중에는 참가자 화면에 "장 마감" 안내가 뜨고 매수가 막힌다. (매도는 참가자 액션이 아니므로 별도 차단 불필요.) **라운드가 "다음 해"로 넘어가면 일시정지 상태는 자동으로 해제된다** (매 라운드는 기본적으로 열린 상태로 시작).
- **게임 종료**: 10번째 라운드(2026년) 거래 후, 진행자가 "게임 종료"를 누르면 남은 보유주식을 2026년 가격으로 최종 청산하고 순위표를 확정 표시한다.
- **공용 전광판**: `/display` — 인증 없이 접근 가능한 읽기 전용 화면. 현재 라운드와 실시간 순위표를 표시 (프로젝터용).

## 아키텍처

- **프론트엔드**: Vite + React + TypeScript SPA. Cloudflare Pages에 정적 파일로 배포. 별도 백엔드 서버 없음.
- **백엔드**: Supabase (Postgres + Realtime + Row Level Security). 데이터 저장, 실시간 동기화, 게임 비즈니스 로직(Postgres RPC 함수)을 전부 담당.
- **인증 방식**: 전통적 로그인 없음. 참가자는 닉네임 문자열이 곧 식별자. 진행자는 PIN을 RPC 파라미터로 전달해 Postgres 함수 내부에서 검증 (클라이언트 조작으로 우회 불가).

### 화면 (라우트)

| 경로 | 대상 | 설명 |
|---|---|---|
| `/` | 참가자 | 닉네임 입장, 보유현금/보유주식, 현재 라운드 7종목 가격, 매수 폼 |
| `/host` | 진행자 | PIN 입력 후: 다음 해 / 게임 종료 / 거래 일시정지·재개 / 새 게임 시작, 참가자 현황 모니터링 |
| `/display` | 공용(프로젝터) | 인증 없음, 현재 라운드 + 실시간 순위표 (읽기 전용) |

## 데이터 모델 (Supabase Postgres)

### `game_state` (싱글턴, 1행 고정)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int (PK, 항상 1) | 싱글턴 고정 |
| current_round | int | 0=대기(게임 시작 전), 1~10=연도 라운드, 11=종료 |
| is_paused | boolean | 거래 일시정지 여부 |
| updated_at | timestamptz | |

### `stocks` (고정 마스터 데이터, 7행)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int (PK) | |
| name | text | 종목명 |
| display_order | int | 화면 표시 순서 |

### `stock_prices` (70행 = 7종목 × 10년)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| stock_id | int (FK → stocks) | |
| year | int | 2016~2026 |
| price | int | 해당 연도 가격(원) |

가격 데이터는 추후 제공받아 시딩 (현재는 스키마만 마련, `0003_seed_stocks.sql`은 placeholder).

### `participants`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| nickname | text (unique, citext) | 로그인 키 역할 |
| cash | bigint | 보유 현금(원), 시작 1,200,000 |
| created_at | timestamptz | |

### `holdings`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| participant_id | uuid (FK) | |
| stock_id | int (FK) | |
| quantity | int | 현재 라운드 보유 수량 |

"다음 해" 처리 시 전량 현금화 후 행 삭제(0으로 초기화).

## 게임 로직 (Postgres RPC, `SECURITY DEFINER`)

- **`join_game(nickname)`**
  기존 닉네임이면 해당 참가자 행 반환(복귀). 없으면 신규 생성(cash=1,200,000). `current_round`가 11(종료)이면 참여 거부.

- **`buy_stock(nickname, stock_id, quantity)`**
  전제 조건: `game_state.is_paused = false`, `current_round`가 1~10 범위. `stock_prices`에서 (stock_id, 현재 라운드 연도) 가격 조회 → `quantity * price <= 참가자.cash` 확인 → cash 차감, holdings 증가. 위반 시 예외.

- **`host_next_year(pin)`**
  PIN 검증. `current_round < 10`이고 종료 상태가 아님을 확인. 모든 참가자에 대해: 보유 종목을 **새 라운드(round+1)의 가격**으로 평가해 cash에 더하고 holdings를 비움. `current_round += 1`, `is_paused = false`로 설정.

- **`host_end_game(pin)`**
  PIN 검증. `current_round = 10`일 때만 허용. 모든 참가자의 남은 보유주식을 2026년(10라운드) 가격으로 최종 청산 → cash에 반영, holdings 비움. `current_round = 11`로 설정.

- **`host_toggle_pause(pin, paused boolean)`**
  PIN 검증. `game_state.is_paused`를 지정된 값으로 변경. 라운드 진행 상태와 무관하게 언제든 호출 가능.

- **`host_reset_game(pin)`**
  PIN 검증. `participants`, `holdings` 전체 삭제. `game_state`를 `current_round = 0`, `is_paused = false`로 리셋.

모든 host RPC는 PIN 불일치 시 예외를 던진다. PIN은 Supabase Vault 또는 환경변수로 관리하고, RPC 내부에서 비교한다 (프론트엔드에는 노출 안 함).

## 실시간 동기화

- 모든 화면은 Supabase Realtime으로 `game_state` 변경(라운드, 일시정지 여부)을 구독 → 즉시 UI 갱신 (새 가격 공개, "장 마감" 배너 등).
- 참가자 화면은 본인 `participants` / `holdings` 행 변경을 구독 → 자동매도 결과(현금 증가, 보유주식 초기화)가 실시간 반영.
- `/display`와 순위 표시는 현금 + 보유주식 평가액(현재 라운드 가격 기준) 합산 뷰(Postgres view 또는 클라이언트 계산)를 구독해 순위 갱신.

## 에러 처리

RPC는 다음 상황에서 예외를 반환하고, 프론트엔드는 이를 한글 안내 메시지로 표시한다:
- 잔액 부족으로 매수 불가
- 거래 일시정지 중 매수 시도
- 잘못된 진행자 PIN
- 라운드 상태 불일치(예: 게임 종료 후 매수 시도, 마지막 라운드 아닌데 게임 종료 시도)

## 테스트 방침

레크리에이션용 소규모 도구로 무거운 자동화 테스트 대신 다음으로 검증한다:
1. Postgres RPC에 대한 SQL 시나리오 테스트: 잔액 부족 매수 거부, 정지 중 매수 거부, 다음 해 자동청산 금액 정확성, PIN 불일치 거부, 게임 리셋 후 상태 초기화.
2. 여러 브라우저 탭으로 참가자 다수를 시뮬레이션하는 수동 QA 체크리스트: 입장 → 매수 → 일시정지/재개 → 다음 해 반복 → 게임 종료 → 순위표 확인.

## 파일 구조

```
/
├── package.json, vite.config.ts, tsconfig.json, .env.example
├── supabase/
│   └── migrations/
│       ├── 0001_init_schema.sql       (game_state, stocks, stock_prices, participants, holdings)
│       ├── 0002_rpc_functions.sql     (join_game, buy_stock, host_* 함수들)
│       └── 0003_seed_stocks.sql       (7종목 이름 + 가격 데이터, 현재 placeholder)
├── src/
│   ├── main.tsx, App.tsx
│   ├── routes/
│   │   ├── ParticipantPage.tsx   (/)
│   │   ├── HostPage.tsx          (/host)
│   │   └── DisplayPage.tsx       (/display)
│   ├── components/
│   │   ├── StockList.tsx
│   │   ├── PortfolioCard.tsx
│   │   ├── Leaderboard.tsx
│   │   └── MarketClosedBanner.tsx
│   ├── lib/
│   │   ├── supabaseClient.ts
│   │   └── types.ts
│   └── hooks/
│       ├── useGameState.ts
│       ├── useParticipant.ts
│       └── useLeaderboard.ts
└── docs/superpowers/specs/2026-07-20-investment-game-design.md
```

## 구현 프로세스 관련 참고사항

- **참가자용(`/`) UI는 구현 전 사용자에게 레이아웃/플로우를 먼저 보여주고 승인받은 뒤 실제 컴포넌트 코드를 작성한다.** 진행자/전광판 화면은 내부 도구 성격이 강해 상대적으로 가벼운 확인으로 진행 가능.
- 7종목명 및 2016~2026년 가격 데이터는 사용자가 추후 제공 예정 — 제공 시 `0003_seed_stocks.sql`을 채운다.
