# 26CAI 모의 투자 레크리에이션

## 준비물
- Node.js 18+
- Supabase 프로젝트 (URL, anon key, DB 연결 문자열)
- `psql` CLI

## 로컬 개발
1. `npm install`
2. `.env.example`을 `.env`로 복사하고 Supabase URL/anon key 입력
3. `export SUPABASE_DB_URL="postgresql://..."` (마이그레이션/테스트 실행용)
4. `supabase/migrations/*.sql`을 번호 순서대로 적용:
   `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_init_schema.sql` (이후 파일도 동일하게 순서대로)
5. `npm run dev`

## 배포 (Cloudflare Pages)
Cloudflare 대시보드에서 이 저장소를 연결하고 Build command `npm run build`, Output directory `dist`로 설정. 환경변수에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 등록.
