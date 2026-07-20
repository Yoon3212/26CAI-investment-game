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

## 배포 (Cloudflare Workers, 정적 자산)
Cloudflare 대시보드 → Workers & Pages에서 이 저장소를 GitHub으로 연결. Build command `npm run build`, Deploy command `npx wrangler deploy` (저장소의 `wrangler.toml`이 `dist/`를 정적 자산으로 배포하도록 설정되어 있음). 환경변수에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 등록.

확인된 배포 URL: https://investmentgame.26cai.workers.dev/
