from __future__ import annotations

from datetime import date
from pathlib import Path

import pandas as pd
import streamlit as st

from aggregator.batches import combine_batches, detect_round, meat_group_subtotals, round_label
from aggregator.excel_export import report_bytes
from aggregator.excel_io import aggregate_orders, read_orders
from aggregator.image_export import render_share_png
from aggregator.storage import save_daily_aggregate, save_kakao_png
from aggregator.summary import production_rows

st.set_page_config(
    page_title="일일 생산 집계표",
    page_icon="🥩",
    layout="wide",
    initial_sidebar_state="expanded",
    menu_items={
        "Get Help": None,
        "Report a bug": None,
        "About": "택배 발송 엑셀로 당일 고기 제조 수량을 집계하는 웹앱입니다.",
    },
)

st.markdown(
    """
    <style>
    .block-container {padding-top: 1.2rem; max-width: 1280px;}
    h1 {letter-spacing: -0.04em;}
    div[data-testid="stMetricValue"] {font-size: 1.55rem;}
    .hero {
        background: linear-gradient(135deg, #1F4E79 0%, #2E86AB 100%);
        color: #fff;
        padding: 1.4rem 1.6rem;
        border-radius: 16px;
        margin-bottom: 1.2rem;
    }
    .hero h1 {color: #fff; font-size: 1.85rem; margin: 0 0 0.35rem 0;}
    .hero p {margin: 0; opacity: 0.92;}
    .step-card {
        background: #fff;
        border: 1px solid #E4EAF0;
        border-radius: 14px;
        padding: 0.2rem 0.4rem 0.8rem 0.4rem;
        margin-bottom: 0.8rem;
    }
    </style>
    <div class="hero">
      <h1>일일 생산 집계표</h1>
      <p>발송 엑셀을 올리면 오늘 만들어야 할 수량을 차수별로 보여 주는 웹앱입니다.</p>
    </div>
    """,
    unsafe_allow_html=True,
)

with st.sidebar:
    st.header("설정")
    report_date = st.date_input("생산일자", value=date.today())
    st.markdown(
        """
        **차수 규칙**
        - 파일명 끝 `01` → 1차
        - 파일명 끝 `02` → 2차
        - 파일명 끝 `03` → 3차
        - 같은 날 여러 파일을 함께 올리면 차수별 + 합계
        """
    )

st.subheader("1. 발송 엑셀 업로드")
uploaded_files = st.file_uploader(
    "택배 발송 엑셀 (.xls / .xlsx) — 하루에 올린 01, 02, 03 파일을 함께 선택하세요",
    type=["xls", "xlsx"],
    accept_multiple_files=True,
)

sample_files = sorted(
    list(Path(".").glob("*EMP*.xls")) + list(Path(".").glob("*EMP*.xlsx")),
    key=lambda p: (detect_round(p.name), p.name),
)
if sample_files:
    with st.sidebar:
        st.caption("폴더 샘플: " + ", ".join(p.name for p in sample_files))
        if st.button("폴더 샘플 01·02·03 차수별 집계"):
            st.session_state["sample_sources"] = [str(p) for p in sample_files]

if uploaded_files:
    sources = list(uploaded_files)
    st.session_state.pop("sample_sources", None)
elif st.session_state.get("sample_sources"):
    sources = list(st.session_state["sample_sources"])
else:
    sources = []

if not sources:
    st.info("웹에서 엑셀을 올리면 1차·2차·3차 제조 수량과 육회·육사시미 총 중량이 바로 나옵니다.")
    left, right = st.columns(2)
    with left:
        st.markdown(
            """
            **사용 순서**
            1. 생산일자를 고릅니다.
            2. 발송 엑셀을 올립니다. (01=1차, 02=2차, 03=3차)
            3. 표를 확인하고 엑셀·이미지로 공유합니다.
            """
        )
    with right:
        st.markdown(
            """
            **저장·공유**
            - 엑셀 다운로드
            - 바탕화면 `일일생산집계` 폴더 저장
            - 카카오 공유용 PNG
            """
        )
    st.stop()

batches = {}
details = {}
errors = []
for index, source in enumerate(sources, start=1):
    name = getattr(source, "name", str(source))
    round_no = detect_round(name, fallback=index)
    try:
        orders = read_orders(source)
        totals, _parsed, detail_df = aggregate_orders(orders)
    except Exception as exc:
        errors.append(f"{name}: {exc}")
        continue
    if round_no in batches:
        batches[round_no].merge(totals)
        details[round_no] = pd.concat([details[round_no], detail_df], ignore_index=True)
    else:
        batches[round_no] = totals
        details[round_no] = detail_df

if errors:
    for msg in errors:
        st.error(msg)
if not batches:
    st.stop()

combined = combine_batches(batches, only_ordered=True)
all_combined = combine_batches(batches, only_ordered=False)
rounds = sorted(batches)
round_cols = [round_label(r) for r in rounds]

sku_count = len(combined)
pack_count = sum(row["합계"] for row in combined)

st.subheader("2. 오늘 만들어야 할 수량")
st.caption("각 차수 파일의 주문을 용량별로 합친 개수입니다. 합계는 당일 전체 제조량입니다.")

metrics = st.columns(max(2, len(rounds) + 2))
metrics[0].metric("제조할 상품(용량)", f"{sku_count}종")
metrics[1].metric("당일 합계", f"{pack_count:g}개")
for idx, round_no in enumerate(rounds):
    col_name = round_label(round_no)
    round_sum = sum(row.get(col_name, 0) or 0 for row in combined)
    metrics[idx + 2].metric(col_name, f"{round_sum:g}개")

display_cols = ["상품", "용량", *round_cols, "합계"]
need_df = pd.DataFrame([{c: row[c] for c in display_cols} for row in combined])
column_config = {
    "상품": st.column_config.TextColumn("상품", width="medium"),
    "용량": st.column_config.TextColumn("용량", width="small"),
    "합계": st.column_config.NumberColumn("합계", format="%d"),
}
for col in round_cols:
    column_config[col] = st.column_config.NumberColumn(col, format="%d")

st.dataframe(
    need_df,
    width="stretch",
    hide_index=True,
    column_config=column_config,
)

st.subheader("육회·육사시미 전용량 중량")
st.caption("모든 용량을 kg으로 합친 값입니다.")
group_rows = meat_group_subtotals(all_combined, rounds)
group_cols = ["품목", "단위", *round_cols, "합계"]
st.dataframe(
    pd.DataFrame([{c: row[c] for c in group_cols} for row in group_rows]),
    width="stretch",
    hide_index=True,
)

st.subheader("3. 저장 · 공유")
xlsx_data = report_bytes(None, report_date, batches)
file_name = f"일일생산집계표_{report_date.strftime('%Y%m%d')}.xlsx"
png_data = render_share_png(
    [{c: row[c] for c in display_cols} for row in combined],
    [{c: row[c] for c in group_cols} for row in group_rows],
    rounds,
    report_date,
)
dl_col, save_col, img_col = st.columns(3)
with dl_col:
    st.download_button(
        label="차수별 총개수 엑셀 다운로드",
        data=xlsx_data,
        file_name=file_name,
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        type="primary",
    )
with save_col:
    if st.button("오늘 집계 저장"):
        folder = save_daily_aggregate(sources, xlsx_data, report_date)
        st.success(f"바탕화면에 저장했습니다: {folder}")
        st.caption("위치: 바탕화면\\일일생산집계\\생산일자  /  같은 날짜에 다시 저장하면 덮어씁니다.")
with img_col:
    if st.button("카카오 공유용 이미지 저장"):
        png_path = save_kakao_png(png_data, report_date, rounds)
        st.success(f"이미지를 저장했습니다: {png_path}")
        st.image(png_data, caption="카카오톡에 이 사진을 보내면 됩니다.")

st.subheader("4. 차수 상세 · 전체 용량표")
tabs = st.tabs([f"{round_label(r)} 상세" for r in rounds] + ["전체 용량표"])
for tab, round_no in zip(tabs, rounds):
    with tab:
        totals = batches[round_no]
        rows = [r for r in production_rows(totals, only_ordered=True)]
        if not rows:
            st.write("이 차수에 집계된 고기가 없습니다.")
        else:
            st.dataframe(
                pd.DataFrame([{"상품": r["상품"], "용량": r["용량"], "총 개수": r["총 개수"]} for r in rows]),
                width="stretch",
                hide_index=True,
            )
        detail_df = details.get(round_no)
        if detail_df is not None and not detail_df.empty:
            with st.expander("파싱 상세", expanded=False):
                st.dataframe(detail_df, width="stretch", hide_index=True)
        if totals.unmatched:
            st.warning("미인식 항목이 있습니다.")
            st.dataframe(pd.DataFrame({"원문": totals.unmatched}), width="stretch", hide_index=True)

with tabs[-1]:
    st.caption("용량별 전체 규격과, 육회·육사시미 전 용량 중량입니다.")
    group_rows = meat_group_subtotals(all_combined, rounds)
    group_cols = ["품목", "단위", *round_cols, "합계"]
    st.subheader("육회·육사시미 전용량 중량")
    st.caption("모든 용량을 kg으로 합친 값입니다.")
    st.dataframe(
        pd.DataFrame([{c: row[c] for c in group_cols} for row in group_rows]),
        width="stretch",
        hide_index=True,
    )
    full_df = pd.DataFrame([{c: row[c] for c in display_cols} for row in all_combined])
    st.subheader("용량별 상세")
    st.dataframe(full_df, width="stretch", hide_index=True)
