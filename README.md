# 일일 생산 집계표 (Streamlit 웹앱)

택배 발송 엑셀을 올리면 용량별 제조 수량과 육회·육사시미 총 중량을 보여주는 웹 프로그램입니다.

## 실행 방법

1. `웹앱실행.bat` 을 더블클릭합니다.
2. 브라우저가 `http://localhost:8501` 로 열립니다.
3. 발송 엑셀(01·02·03)을 업로드합니다.

직접 실행:

```bash
pip install -r requirements.txt
streamlit run app.py
```

## 주요 기능

- 파일명 끝 01 / 02 / 03 → 1차 / 2차 / 3차 집계
- 상품·용량별 오늘 만들어야 할 개수
- 육회·육사시미 전용량 중량(kg)
- 엑셀 다운로드, 바탕화면 저장, 카카오 공유용 PNG

저장 위치(이 PC에서 실행할 때): `바탕화면\일일생산집계\날짜`

## 웹 주소로 바로 쓰기 (설치 없음)

무료 Streamlit Community Cloud에 올리면 `https://....streamlit.app` 주소로 누구나 브라우저에서 쓸 수 있습니다.

1. [앱 배포하기](https://share.streamlit.io/deploy?repository=chowooori/meat-daily-aggregator&branch=main&mainModule=app.py) 에서 GitHub로 로그인
2. **Create app** → 저장소 `chowooori/meat-daily-aggregator` , 파일 `app.py`
3. Deploy 후 나온 주소를 팀원에게 공유

`Error installing requirements` 가 나오면 리눅스 시스템 패키지 설치가 막힌 경우가 많습니다. 이 저장소는 폰트를 앱에 포함해서 `packages.txt` 없이 배포합니다. GitHub에 최신 코드가 반영된 뒤 Streamlit에서 **Reboot app** 또는 다시 Deploy 하면 됩니다.

