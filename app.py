from __future__ import annotations

from datetime import date
from pathlib import Path

import pandas as pd
import streamlit as st

from aggregator.batches import combine_batches, detect_round, meat_group_subtotals, round_label
from aggregator.excel_export import report_bytes
from aggregator.excel_io import aggregate_orders, read_orders
from aggregator.image_export import render_share_png
from aggregator.storage import desktop_writable, save_daily_aggregate, save_kakao_png
from aggregator.summary import production_rows


def _display_cell(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return f"{value:g}"
    return str(value)


def left_text_df(df: pd.DataFrame) -> pd.DataFrame:
    formatted = df.copy()
    for col in formatted.columns:
        formatted[col] = formatted[col].map(_display_cell)
    return formatted


def text_column_config(df: pd.DataFrame) -> dict:
    return {col: st.column_config.TextColumn(col) for col in df.columns}


st.set_page_config(
    page_title="일일 생산 집계",
    page_icon="🥩",
    layout="wide",
    initial_sidebar_state="collapsed",
    menu_items={
        "Get Help": None,
        "Report a bug": None,
        "About": "택배 발송 엑셀로 당일 고기 제조 수량을 집계합니다.",
    },
)

st.markdown(
    """
    <style>
    @import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
    html, body, [class*="css"], .stApp, .stMarkdown, .stCaption, p, h1, h2, h3 {
        font-family: Pretendard, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif !important;
    }
    .stApp { background: #E8EEF4; }
    header[data-testid="stHeader"] { background: transparent; }
    #MainMenu, footer, .stDeployButton { visibility: hidden; height: 0; }
    .block-container {padding-top: 1.4rem; padding-bottom: 3rem; max-width: 1120px;}
    h1, h2, h3 { letter-spacing: -0.03em; color: #12202F; }
    div[data-testid="stMetric"] {
        background: #fff;
        border: 1px solid #D7E0EA;
        border-radius: 14px;
        padding: 0.95rem 1.1rem 0.85rem 1.1rem;
        box-shadow: 0 1px 0 rgba(18, 32, 47, 0.04);
    }
    div[data-testid="stMetricValue"] {font-size: 1.7rem; text-align: left; font-weight: 700; color: #163A5F;}
    div[data-testid="stMetricLabel"] {text-align: left; color: #5B6B7C; font-weight: 600;}
    [data-testid="stDataFrame"] {
        border: 1px solid #D7E0EA;
        border-radius: 12px;
        overflow: hidden;
    }
    [data-testid="stDataFrame"] [role="columnheader"],
    [data-testid="stDataFrame"] [role="gridcell"] {
        justify-content: flex-start !important;
        text-align: left !important;
    }
    [data-testid="stDataFrame"] [role="columnheader"] > div,
    [data-testid="stDataFrame"] [role="gridcell"] > div {
        justify-content: flex-start !important;
        text-align: left !important;
        width: 100%;
    }
    [data-testid="stFileUploaderDropzone"] {
        background: #F7FAFC;
        border: 1.5px dashed #9BB0C4 !important;
        border-radius: 14px;
        padding: 1.4rem 1rem;
    }
    [data-testid="stFileUploaderDropzone"] svg { color: #163A5F; }
    .hero {
        background: linear-gradient(135deg, #10253C 0%, #1C4A73 58%, #2A6A8F 100%);
        color: #fff;
        padding: 1.55rem 1.7rem 1.4rem 1.7rem;
        border-radius: 18px;
        margin-bottom: 1.15rem;
        box-shadow: 0 10px 28px rgba(16, 37, 60, 0.18);
    }
    .hero .eyebrow {
        font-size: 0.72rem;
        letter-spacing: 0.16em;
        font-weight: 700;
        opacity: 0.72;
        margin: 0 0 0.4rem 0;
        text-transform: uppercase;
    }
    .hero h1 {color: #fff; font-size: 1.85rem; margin: 0 0 0.4rem 0; font-weight: 700;}
    .hero p {margin: 0; opacity: 0.9; font-size: 0.98rem; line-height: 1.5;}
    .panel {
        background: #fff;
        border: 1px solid #D7E0EA;
        border-bottom: none;
        border-radius: 16px 16px 0 0;
        padding: 1.15rem 1.2rem 0.15rem 1.2rem;
        margin-bottom: 0;
        box-shadow: 0 1px 0 rgba(18, 32, 47, 0.04);
    }
    [data-testid="stFileUploader"] {
        background: #fff;
        border: 1px solid #D7E0EA;
        border-top: none;
        border-radius: 0 0 16px 16px;
        padding: 0 1.1rem 1.05rem 1.1rem;
        margin-bottom: 1rem;
    }
    .panel h3 { margin: 0 0 0.2rem 0; font-size: 1.05rem; }
    .panel .hint { color: #5B6B7C; font-size: 0.88rem; margin: 0 0 0.8rem 0; }
    .guide-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 0.2rem 0 0.6rem 0; }
    .guide-card {
        background: #fff;
        border: 1px solid #D7E0EA;
        border-radius: 14px;
        padding: 1rem 1.05rem 1.05rem 1.05rem;
    }
    .guide-num {
        width: 26px; height: 26px; border-radius: 8px;
        background: #163A5F; color: #fff;
        font-size: 0.78rem; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        margin-bottom: 0.55rem;
    }
    .guide-card h4 { margin: 0 0 0.3rem 0; font-size: 0.95rem; }
    .guide-card p { margin: 0; color: #5B6B7C; font-size: 0.84rem; line-height: 1.45; }
    .section-label {
        font-size: 0.72rem;
        letter-spacing: 0.12em;
        font-weight: 700;
        color: #6A7B8C;
        text-transform: uppercase;
        margin: 0.4rem 0 0.35rem 0;
    }
    @media (max-width: 800px) {
        .guide-grid { grid-template-columns: 1fr; }
    }
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown(
    """
    <div class="hero">
      <p class="eyebrow">Daily Production</p>
      <h1>일일 생산 집계</h1>
      <p>발송 엑셀을 올리면 차수별 제조 수량과 육회·육사시미 중량이 바로 나옵니다.</p>
    </div>
    """,
    unsafe_allow_html=True,
)

with st.container(border=True):
    head_l, head_r = st.columns([3.2, 1.1])
    with head_l:
        st.markdown("**발송 엑셀 업로드**")
        st.caption("당일 01 · 02 · 03 파일을 한 번에 올려 주세요. xls, xlsx 모두 가능합니다.")
    with head_r:
        report_date = st.date_input("생산일자", value=date.today())
    uploaded_files = st.file_uploader(
        "발송 엑셀 파일",
        type=["xls", "xlsx"],
        accept_multiple_files=True,
        label_visibility="collapsed",
    )

with st.sidebar:
    st.markdown("**파일명 규칙**")
    st.caption("01 → 1차 · 02 → 2차 · 03 → 3차")
    st.caption("같은 날 파일을 함께 올리면 차수별 합계까지 계산합니다.")

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
    st.markdown(
        """
        <div class="guide-grid">
          <div class="guide-card">
            <div class="guide-num">1</div>
            <h4>생산일자 확인</h4>
            <p>업로드 카드에서 생산일자가 오늘인지 확인합니다.</p>
          </div>
          <div class="guide-card">
            <div class="guide-num">2</div>
            <h4>발송 엑셀 업로드</h4>
            <p>파일명 끝 01·02·03이 1차·2차·3차로 자동 구분됩니다.</p>
          </div>
          <div class="guide-card">
            <div class="guide-num">3</div>
            <h4>엑셀·이미지 공유</h4>
            <p>집계표를 내려받아 카카오톡으로 보내면 됩니다.</p>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
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

st.markdown('<p class="section-label">Today</p>', unsafe_allow_html=True)
st.subheader("오늘 만들어야 할 수량")
st.caption("차수 파일의 주문을 용량별로 합친 개수입니다. 합계는 당일 전체 제조량입니다.")

metrics = st.columns(max(2, len(rounds) + 2))
metrics[0].metric("제조할 상품(용량)", f"{sku_count}종")
metrics[1].metric("당일 합계", f"{pack_count:g}개")
for idx, round_no in enumerate(rounds):
    col_name = round_label(round_no)
    round_sum = sum(row.get(col_name, 0) or 0 for row in combined)
    metrics[idx + 2].metric(col_name, f"{round_sum:g}개")

display_cols = ["상품", "용량", *round_cols, "합계"]
need_df = left_text_df(pd.DataFrame([{c: row[c] for c in display_cols} for row in combined]))

st.dataframe(
    need_df,
    width="stretch",
    hide_index=True,
    column_config=text_column_config(need_df),
)

st.subheader("육회·육사시미 전용량 중량")
st.caption("모든 용량을 kg으로 합친 값입니다.")
group_rows = meat_group_subtotals(all_combined, rounds)
group_cols = ["품목", "단위", *round_cols, "합계"]
group_df = left_text_df(pd.DataFrame([{c: row[c] for c in group_cols} for row in group_rows]))
st.dataframe(
    group_df,
    width="stretch",
    hide_index=True,
    column_config=text_column_config(group_df),
)

st.markdown('<p class="section-label">Share</p>', unsafe_allow_html=True)
st.subheader("저장 · 공유")
st.caption("엑셀과 이미지를 받아 카카오톡으로 보내면 됩니다.")
xlsx_data = report_bytes(None, report_date, batches)
file_name = f"일일생산집계표_{report_date.strftime('%Y%m%d')}.xlsx"
png_name = f"카카오공유_{report_date.strftime('%Y%m%d')}.png"
png_data = render_share_png(
    [{c: row[c] for c in display_cols} for row in combined],
    [{c: row[c] for c in group_cols} for row in group_rows],
    rounds,
    report_date,
)
dl_col, img_col, save_col = st.columns(3)
with dl_col:
    st.download_button(
        label="엑셀 다운로드",
        data=xlsx_data,
        file_name=file_name,
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        type="primary",
    )
with img_col:
    st.download_button(
        label="카카오 공유용 이미지 다운로드",
        data=png_data,
        file_name=png_name,
        mime="image/png",
    )
with save_col:
    if desktop_writable():
        if st.button("오늘 집계 저장 (이 PC 바탕화면)"):
            folder = save_daily_aggregate(sources, xlsx_data, report_date)
            save_kakao_png(png_data, report_date, rounds)
            st.success(f"바탕화면에 저장했습니다: {folder}")
    else:
        st.caption("이 웹에서는 위 다운로드 버튼을 사용하세요.")
with st.expander("카카오 공유 이미지 미리보기"):
    st.image(png_data, caption="이 이미지를 받아 카카오톡에 보내면 됩니다.")

st.markdown('<p class="section-label">Details</p>', unsafe_allow_html=True)
st.subheader("차수 상세")
tabs = st.tabs([f"{round_label(r)} 상세" for r in rounds] + ["전체 용량표"])
for tab, round_no in zip(tabs, rounds):
    with tab:
        totals = batches[round_no]
        rows = [r for r in production_rows(totals, only_ordered=True)]
        if not rows:
            st.write("이 차수에 집계된 고기가 없습니다.")
        else:
            detail_qty = left_text_df(
                pd.DataFrame([{"상품": r["상품"], "용량": r["용량"], "총 개수": r["총 개수"]} for r in rows])
            )
            st.dataframe(
                detail_qty,
                width="stretch",
                hide_index=True,
                column_config=text_column_config(detail_qty),
            )
        detail_df = details.get(round_no)
        if detail_df is not None and not detail_df.empty:
            with st.expander("파싱 상세", expanded=False):
                parsed_df = left_text_df(detail_df)
                st.dataframe(
                    parsed_df,
                    width="stretch",
                    hide_index=True,
                    column_config=text_column_config(parsed_df),
                )
        if totals.unmatched:
            st.warning("미인식 항목이 있습니다.")
            st.dataframe(pd.DataFrame({"원문": totals.unmatched}), width="stretch", hide_index=True)

with tabs[-1]:
    st.caption("용량별 전체 규격과, 육회·육사시미 전 용량 중량입니다.")
    group_rows = meat_group_subtotals(all_combined, rounds)
    group_cols = ["품목", "단위", *round_cols, "합계"]
    st.subheader("육회·육사시미 전용량 중량")
    st.caption("모든 용량을 kg으로 합친 값입니다.")
    full_group_df = left_text_df(pd.DataFrame([{c: row[c] for c in group_cols} for row in group_rows]))
    st.dataframe(
        full_group_df,
        width="stretch",
        hide_index=True,
        column_config=text_column_config(full_group_df),
    )
    full_df = left_text_df(pd.DataFrame([{c: row[c] for c in display_cols} for row in all_combined]))
    st.subheader("용량별 상세")
    st.dataframe(
        full_df,
        width="stretch",
        hide_index=True,
        column_config=text_column_config(full_df),
    )
