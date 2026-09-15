"""엑셀 업로드 → 집계."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import BinaryIO

import pandas as pd

from aggregator.categories import DailyTotals
from aggregator.parser import ParsedLine, accumulate, parse_option_text

OPTION_ALIASES = ("주문선택사항", "선택사항", "옵션", "주문옵션")
QTY_ALIASES = ("주문수량", "수량", "개수")


def _normalize_col(name: object) -> str:
    return str(name).replace(" ", "").replace("\n", "").strip()


def _find_column(columns: list[str], aliases: tuple[str, ...]) -> str | None:
    normalized = {_normalize_col(c): c for c in columns}
    for alias in aliases:
        key = alias.replace(" ", "")
        if key in normalized:
            return normalized[key]
        for ncol, original in normalized.items():
            if key in ncol:
                return original
    return None


def _locate_header_row(raw: pd.DataFrame) -> int:
    max_scan = min(20, len(raw))
    for idx in range(max_scan):
        values = [_normalize_col(v) for v in raw.iloc[idx].tolist()]
        joined = "|".join(values)
        if "주문선택사항" in joined and "주문수량" in joined:
            return idx
        if any("주문선택" in v for v in values) and any("수량" in v for v in values):
            return idx
    return 0


def read_orders(source: str | Path | BytesIO | BinaryIO) -> pd.DataFrame:
    name = getattr(source, "name", "")
    suffix = Path(str(name)).suffix.lower()
    if isinstance(source, (str, Path)):
        suffix = Path(source).suffix.lower()

    if suffix == ".xls":
        df_raw = pd.read_excel(source, header=None, dtype=object, engine="xlrd")
    else:
        df_raw = pd.read_excel(source, header=None, dtype=object, engine="openpyxl")

    header_row = _locate_header_row(df_raw)
    header = df_raw.iloc[header_row].tolist()
    body = df_raw.iloc[header_row + 1 :].copy()
    body.columns = [str(c).strip() if pd.notna(c) else f"col_{i}" for i, c in enumerate(header)]
    body = body.dropna(how="all")
    return body.reset_index(drop=True)


def aggregate_orders(df: pd.DataFrame) -> tuple[DailyTotals, list[ParsedLine], pd.DataFrame]:
    option_col = _find_column(list(df.columns), OPTION_ALIASES)
    qty_col = _find_column(list(df.columns), QTY_ALIASES)
    if option_col is None or qty_col is None:
        raise ValueError(
            "필수 열을 찾지 못했습니다. '주문선택사항'과 '주문수량' 열이 있는지 확인하세요. "
            f"현재 열: {list(df.columns)}"
        )

    totals = DailyTotals()
    parsed: list[ParsedLine] = []
    for _, row in df.iterrows():
        option = row[option_col]
        qty_raw = row[qty_col]
        try:
            qty = int(float(qty_raw)) if pd.notna(qty_raw) else 1
        except (TypeError, ValueError):
            qty = 1
        lines = parse_option_text(option, qty)
        parsed.extend(lines)
        accumulate(lines, totals)

    detail_rows = [
        {
            "원문": line.original,
            "품목": line.product or "(미인식)",
            "용량(g)": line.grams,
            "묶음수량": line.inner_qty,
            "주문수량": line.order_qty,
            "최종수량": line.final_qty,
            "구분": line.mode,
            "비고": line.note,
        }
        for line in parsed
    ]
    detail_df = pd.DataFrame(detail_rows)
    return totals, parsed, detail_df
