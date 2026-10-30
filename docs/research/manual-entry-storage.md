# 차수 누적·수동 입력 저장 구조 조사

질문: 차수 누적, 수동 입력(메모 포함), 새 용량·품목을 기존 `production_jobs`·`production_rows` 표에 그대로 담을 수 있는가? 가장 단순한 저장 구조와 날짜별 불러오기 방법은?

결론 먼저: **표 구조를 바꾸지 않고(안 A) 담을 수 있다.** 단, "저장 1건 = 차수 하나 또는 수동 묶음 하나"라는 약속과, 저장 중 실패한 건을 걸러 내는 `status` 사용 규칙이 필요하다.

## 0. 중요한 전제: 실제 DB를 확인하지 못했다

- Supabase 프로젝트 `jrtqareognlcbivlfsgd`의 상태가 **`INACTIVE`(일시 중지)** 다 (Supabase MCP `get_project`, 2026-10-30 조회). `execute_sql`·`list_tables`는 모두 "Database is possibly not accessible" 오류.
- 그래서 아래 1절의 표 구조는 **코드가 넣는 값에서 거꾸로 추정한 것**이다. 열 타입·기본값·제약·인덱스·행 수는 확인되지 않았다.
- 프로젝트가 멈춰 있으면 운영 중인 앱의 "DB 저장"도 실패한다. 복구(restore)는 이 조사에서 하지 않았다. 출고 변환기·매출 대시보드도 같은 프로젝트를 쓴다(README.md "Supabase" 절).

## 1. 사실: 지금 저장 방식

출처: `lib/supabase/saveProduction.ts`, `app/api/production/route.ts`, `components/AggregatorApp.tsx`, `supabase/lock_anon_access.sql`

**production_jobs** (저장 1회 = 1행, 코드가 넣는 열)

| 열 | 코드상 값 | 추정 타입 |
|---|---|---|
| id | insert 후 `select("id")`로 받음 | 자동 증가 정수 |
| report_date | `YYYY-MM-DD` 문자열 | date |
| source_files | 파일명 배열 | text[] |
| rounds | 차수 배열, 예 `[1,2,3]` | int[] |
| sku_count / pack_count / unmatched_count | 숫자 | int |
| status | `"ok"` 또는 `"partial"`(파일 오류가 있을 때) | text |
| message | 요약 문구 또는 오류 목록 | text |

`created_at` 같은 저장 시각 열은 코드에 나오지 않는다(있는지 미확인).

**production_rows** (job 1건에 여러 행, 200행씩 나눠 insert)

| 열 | 코드상 값 |
|---|---|
| job_id | 위 job의 id |
| row_no | 1부터 순번 |
| kind | `"pack"`(상품·용량별 개수) 또는 `"group_kg"`(육사시미·육회 kg 소계) |
| product / category / size_label | 예 `육회 1kg` / `육회` / `1kg` |
| size_g | 그램 수(예 1000), group_kg는 null |
| unit | `"개"` 또는 `"kg"` |
| round_1 / round_2 / round_3 | 그 차수 수량, 해당 차수가 없으면 null |
| qty_total | 합계 |
| payload | 객체 `{상품, 품목, 용량, 합계}` 등 → jsonb로 추정 |

그 밖의 사실:
- 저장은 브라우저가 아니라 서버 라우트 `POST /api/production`이 `SUPABASE_SECRET_KEY`로 한다(`lib/supabase/server.ts`). 두 표는 공개 키 접근이 막혀 있다(`lock_anon_access.sql`의 revoke + RLS). **읽기(GET) 라우트는 아직 없다.**
- 지금은 업로드한 모든 차수를 **job 하나에 묶어** 저장한다(`rounds: [1,2,3]` 등). 차수 열이 `round_1~3` 셋뿐이라 4차 이상은 행에 담기지 않는다. 파일명 끝 두 자리 숫자로 차수를 읽으므로(`lib/aggregator/batches.ts`의 `detectRound`) 이론상 4 이상도 나올 수 있다.
- job insert → rows insert가 한 트랜잭션이 아니다. rows 저장이 실패하면 job을 지우지만, 그 삭제마저 실패하면 행이 덜 들어간 job이 남는다.
- `meatGroupSubtotals`는 `품목 === "육사시미"`인 행만 kg으로 더한다. `YUKASHIMI_SIZES`는 `[200,250,300,400,500,600]`(`lib/aggregator/categories.ts`).
- 기존 기록: job id 1(생산일자 2026-10-11, 실제 내용은 9/17 샘플, rows 12줄)은 시험 저장이라는 메모가 있다(`.scratch/wayfinder-manual-entry/tickets/04-task-delete-test-job.md`). id 2의 내용은 DB가 멈춰 있어 확인하지 못했다.

## 2. 선택지

### 안 A — 표 변경 없음, 저장 약속만 바꾼다 (권장)

- **차수 1개 = job 1건.** `rounds = [n]`, rows는 `round_n`과 `qty_total`에 같은 수량을 넣고 나머지 round 열은 null.
- **수동 입력 = job 1건.** `rounds = [0]`(0을 "수동"으로 약속), `source_files = []`, `status = "ok"`.
  - 수동 줄 하나 = rows 1행: `kind = "pack"`, product/category/size_label/size_g는 고정 목록 값, `round_1~3 = null`, `qty_total = 수량`, `payload = { 품목, 용량, 수량, 메모 }`.
  - 같은 품목·용량이 메모만 다르게 여러 줄이어도 행을 합치지 않고 그대로 둔다(`row_no`로 순서 유지). 화면에서 줄을 고치거나 지우면 묶음 전체를 새 job으로 다시 저장한다(옛 job은 이력으로 남음).
- **날짜 불러오기:** `GET /api/production?date=YYYY-MM-DD` (서버 비밀 키 사용).
  1. `production_jobs`에서 `report_date = 날짜`이고 `status in ('ok','partial')`인 행을 `id` 내림차순으로 가져온다.
  2. 서버 코드에서 `rounds` 배열의 각 값(0,1,2,3…)마다 **처음 만나는 job**(= 가장 최근 것)을 고른다.
  3. 고른 job들의 `production_rows`를 `job_id in (...)`로 한 번에 가져와 차수별·수동 열로 다시 조립한다.
  - 하루 job 수가 많아야 수십 건이라 SQL `distinct on` 없이 앱 코드로 고르면 충분하다. 저장 시각 열이 없어도 `id`가 커질수록 최신이다.
- **덜 저장된 job 걸러 내기:** job을 `status = "saving"`으로 넣고, rows를 다 넣은 뒤 `"ok"`/`"partial"`로 바꾼다. 불러올 때는 `saving`을 무시한다. 표 변경 없이 update 한 번만 추가된다.
- **kg 소계(group_kg 행):** 불러올 때는 pack 행에서 다시 계산하고 저장된 group_kg 행은 쓰지 않는다. 그래야 육사시미 덩어리 규칙이 바뀌어도 옛 기록이 새 규칙으로 계산된다. 새 저장에서 group_kg 행을 계속 넣을지는 선택(넣어도 해가 없음).
- 장점: DDL 없음. 다른 앱과 같이 쓰는 DB를 건드리지 않는다. 지금 저장 코드(`insertProductionJob`)를 거의 그대로 쓴다.
- 단점: "0 = 수동"은 코드 속 약속이라 DB만 보는 사람에게는 안 보인다. 4차 이상은 `round_n` 열이 없어 `qty_total`·`rounds`로만 구분된다(job이 차수 하나뿐이라 실제로 문제는 없음).

### 안 B — 작은 마이그레이션

- `production_jobs`에 `source text not null default 'upload'`('upload'/'manual')와 `round smallint`(수동은 null) 추가, `(report_date, source, round, id desc)` 인덱스 추가.
- 장점: 의미가 표에 드러나고, `distinct on (source, round)` 한 줄 SQL로 최신 job을 고를 수 있다.
- 단점: 같이 쓰는 DB에 DDL. 지금은 프로젝트가 멈춰 있어 적용·검증이 바로 안 된다. 하루 수십 건 규모에서는 성능 이득이 없다. 기존 `rounds` 배열과 정보가 겹친다.

### 안 C — 수동 입력 전용 새 표

- `production_manual_lines(report_date, 품목, 용량, 수량, 메모, …)`를 따로 만든다.
- 장점: 줄 단위 수정·삭제가 자연스럽다.
- 단점: 표 2개 추가 + RLS 잠금 SQL 추가. "새로 저장하면 최신이 이기고 이력은 남는다"를 다시 설계해야 한다. 이번 기능 규모에 비해 크다.

## 3. 새 용량·품목 (육사시미 1kg/2kg, 육사시미 덩어리)

- 저장 쪽은 **변경 없음.** `size_label`·`category`는 글자, `size_g`는 2000도 담기는 숫자다(타입 미확인이지만 이미 1000을 넣고 있음).
- 코드 쪽 변경이 필요한 곳:
  - `YUKASHIMI_SIZES`에 1000, 2000 추가 → `DailyTotals.yukashimi`가 자동으로 받는다.
  - "육사시미 덩어리"는 `PRODUCTS`에 새 품목(1kg 단위)으로 추가. 별칭 `육사시미`가 `육사시미 덩어리` 글자에도 걸리므로 `덩어리` 별칭을 더 길게 두어야 한다(별칭은 긴 것부터 비교함, `categories.ts`의 `ALIAS_INDEX` 정렬).
  - `meatGroupSubtotals`는 지금 `품목 === "육사시미"`만 센다 → `육사시미 덩어리`도 육사시미 kg에 더하도록 고쳐야 한다(`GLOSSARY.md` "중량 합계").

## 4. 기존 job 1, 2가 깨뜨리는 것

- 둘 다 여러 차수를 한 job에 묶은 옛 형식일 수 있다(`rounds = [1,2,…]`). 안 A의 고르기 규칙("rounds의 각 값마다 최신 job")은 이런 job도 그대로 처리한다: 옛 job이 1·2차를 함께 들고 있으면 각 차수의 후보가 되고, 그 뒤 새로 저장한 차수가 이긴다. 행에서 해당 차수 수량은 `round_n` 열로 읽으면 된다.
- 즉 **읽는 쪽은 `qty_total`이 아니라 `round_n`(수동은 `qty_total`)을 읽도록** 만들면 옛 job과 새 job을 같은 코드로 다룰 수 있다.
- job 1은 2026-10-11 날짜에 9/17 샘플이 들어 있어, 누적 조회가 생기면 10/11 실제 기록처럼 보인다. 삭제 여부는 티켓 04에서 사용자 승인 대기.

## 5. 권장

**안 A.** 차수마다 job 하나, 수동은 `rounds = [0]` job 하나, 메모는 `payload`, 최신 고르기는 GET 라우트에서 `id` 내림차순으로 앱 코드가 처리, `status = "saving"`으로 덜 저장된 건을 거른다. 나중에 DB를 직접 보며 분석할 일이 생기면 그때 안 B의 `source` 열만 추가해도 늦지 않다.

## 6. 사용자에게 물을 것

1. Supabase 프로젝트가 **일시 중지(INACTIVE)** 상태다. 복구(restore)해도 되는가? 복구 전에는 저장·불러오기 모두 안 되고, 실제 표 구조도 확인할 수 없다. 복구 후 열 타입·행 수를 다시 확인해야 한다.
2. 수동 입력을 "차수 0"으로 약속해 저장해도 괜찮은가, 아니면 표에 `source` 열을 추가(안 B)하는 쪽이 좋은가?
3. 한 날짜에 같은 품목·용량의 수동 줄이 메모만 다르게 여러 개일 때, 결과표 "수동" 열에는 합친 수량만 보이고 메모는 따로(예: 줄 목록) 보이면 되는가?
4. 4차 이상이 실제로 생길 수 있는가? 생기면 화면의 열 구성만 늘리면 되고 저장은 안 A로 문제없다.
5. 시험 job id 1을 지울 것인가(티켓 04)?
