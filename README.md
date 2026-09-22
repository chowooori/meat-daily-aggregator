# 일일 생산 집계 (Vercel / Next.js)

택배 발송 엑셀을 올리면 용량별 제조 수량과 육회·육사시미 총 중량을 보여주는 웹앱입니다.
출고 엑셀 변환기와 같이 **브라우저에서만** 엑셀을 처리하고 Vercel에 배포합니다.

## 주요 기능

- 파일명 끝 01 / 02 / 03 → 1차 / 2차 / 3차 집계
- 상품·용량별 오늘 만들어야 할 개수
- 육회·육사시미 전용량 중량(kg)
- 엑셀 다운로드, 카카오 공유용 PNG

## 로컬 실행

Node.js 20 이상:

```powershell
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 을 엽니다.

테스트:

```powershell
npm test
npm run build
```

## Vercel 배포

1. 이 저장소를 GitHub에 푸시합니다.
2. [Vercel](https://vercel.com/new)에서 Import → Framework: **Next.js**
3. Deploy 후 나온 주소를 팀원에게 공유합니다.

업로드한 발송 엑셀은 서버로 전송되지 않고, 사용자 브라우저 메모리에서만 집계됩니다.

## 참고

- 예전 Streamlit 버전(`app.py`, `aggregator/`)은 로컬 참고용으로 남겨 두었습니다.
- 웹 배포·일상 사용은 Next.js 앱(`npm run dev` / Vercel)을 사용하세요.
