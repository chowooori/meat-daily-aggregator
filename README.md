# 일일 생산 집계 (Vercel / Next.js)

택배 발송 엑셀을 올리면 용량별 제조 수량과 육회·육사시미 총 중량을 보여주는 웹앱입니다.
출고 엑셀 변환기와 같이 **브라우저에서만** 엑셀을 처리하고 Vercel에 배포합니다.

## 주요 기능

- 파일명 끝 01 / 02 / 03 → 1차 / 2차 / 3차 집계
- 상품·용량별 오늘 만들어야 할 개수
- 육회·육사시미 전용량 중량(kg)
- 엑셀 다운로드, 카카오 공유용 PNG
- 「오늘 집계 DB 저장」→ Supabase `production_jobs` / `production_rows` (이력 추가)

## 로컬 실행

Node.js 20 이상:

```powershell
npm install
copy .env.example .env.local
# .env.local 에 출고 변환기와 같은 Supabase URL / anon key 입력
npm run dev
```

브라우저에서 `http://localhost:3000` 을 엽니다.

테스트:

```powershell
npm test
npm run build
```

## Supabase

출고 엑셀 변환기·매출 대시보드와 **같은 프로젝트**를 씁니다.

| 테이블 | 역할 |
|--------|------|
| `production_jobs` | 저장 1회 = 1건 (생산일자, 파일명, 합계) |
| `production_rows` | 상품·용량 수량 및 육회/육사시미 kg |

원본 EMP 엑셀은 저장하지 않고 **집계 결과만** 넣습니다. 같은 날 다시 저장하면 새 job이 추가됩니다.

Vercel Environment Variables에도 동일하게 등록하세요.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Vercel 배포

1. 이 저장소를 GitHub에 푸시합니다.
2. [Vercel](https://vercel.com/new)에서 Import → Framework: **Next.js**
3. Deploy 후 나온 주소를 팀원에게 공유합니다.

업로드한 발송 엑셀은 서버로 전송되지 않고, 사용자 브라우저 메모리에서만 집계됩니다.

## 참고

- 예전 Streamlit 버전(`streamlit_app.py`, `aggregator/`, `legacy/requirements-streamlit.txt`)은 로컬 참고용으로 남겨 두었습니다.
  Vercel은 Next.js만 사용하므로 루트에 `app.py`·`requirements.txt`를 두지 않습니다.
- 웹 배포·일상 사용은 Next.js 앱(`npm run dev` / Vercel)을 사용하세요.
