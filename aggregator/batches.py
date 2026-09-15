"""파일명 차수 인식과 차수별 용량 합계."""

from __future__ import annotations

import re
from pathlib import Path

from aggregator.categories import DailyTotals
from aggregator.summary import production_rows

ROUND_RE = re.compile(r"(?:^|[^\d])(\d{2})\.(?:xls|xlsx)$", re.IGNORECASE)


def detect_round(filename: str, fallback: int | None = None) -> int:
    """파일명 끝의 01, 02, 03 → 1차, 2차, 3차."""
    name = Path(filename).name
    match = ROUND_RE.search(name)
    if match:
        return int(match.group(1))
    if fallback is not None:
        return fallback
    return 1


def round_label(round_no: int) -> str:
    return f"{round_no}차"


def combine_batches(
    batches: dict[int, DailyTotals],
    *,
    only_ordered: bool = True,
) -> list[dict]:
    """상품·용량별 1차/2차/3차 개수와 일일 합계."""
    by_round: dict[int, dict[str, dict]] = {}
    ordered_keys: list[tuple[str, str, str, int]] = []
    seen: set[str] = set()

    for round_no in sorted(batches):
        mapping: dict[str, dict] = {}
        for row in production_rows(batches[round_no], only_ordered=False):
            mapping[row["상품"]] = row
            if row["상품"] not in seen:
                seen.add(row["상품"])
                ordered_keys.append((row["상품"], row["품목"], row["용량"], int(row.get("grams") or 0)))
        by_round[round_no] = mapping

    rounds = sorted(by_round)
    combined: list[dict] = []
    for product, category, size, grams in ordered_keys:
        rec: dict = {"상품": product, "품목": category, "용량": size, "grams": grams}
        total = 0
        for round_no in rounds:
            qty = 0
            row = by_round[round_no].get(product)
            if row:
                qty = row["총 개수"] or 0
            rec[round_label(round_no)] = qty
            total += qty
        rec["합계"] = total
        if only_ordered and not total:
            continue
        combined.append(rec)
    return combined


def meat_group_subtotals(rows: list[dict], rounds: list[int]) -> list[dict]:
    """육회·육사시미 전 용량 중량 합계(kg)."""
    round_cols = [round_label(r) for r in rounds]
    result: list[dict] = []
    for name in ("육사시미", "육회"):
        kilos = {col: 0.0 for col in round_cols}
        for row in rows:
            if row.get("품목") != name:
                continue
            grams = int(row.get("grams") or 0)
            for col in round_cols:
                qty = row.get(col) or 0
                kilos[col] += qty * grams / 1000
        kilo_total = sum(kilos.values())
        result.append(
            {
                "품목": name,
                "단위": "kg",
                **{col: round(kilos[col], 2) for col in round_cols},
                "합계": round(kilo_total, 2),
            }
        )
    return result
