"""주문선택사항 문자열 파싱."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

from aggregator.categories import DailyTotals, find_product, is_excluded

WEIGHT_RE = re.compile(
    r"(?P<num>\d+(?:\.\d+)?)\s*(?P<unit>kg|g)",
    re.IGNORECASE,
)
MULT_X_RE = re.compile(r"[xX×*]\s*(?P<n>\d+)")
MULT_GAE_RE = re.compile(r"(?P<n>\d+)\s*개")
PLUS_SPLIT_RE = re.compile(r"\s*[+＋]\s*")


@dataclass
class ParsedLine:
    original: str
    product: str
    grams: int | None
    inner_qty: int
    order_qty: int
    final_qty: float
    mode: str
    note: str = ""


def _to_grams(num: str, unit: str) -> int:
    value = float(num)
    if unit.lower() == "kg":
        return int(round(value * 1000))
    return int(round(value))


def _inner_multiplier(text: str) -> int:
    match_x = MULT_X_RE.search(text)
    if match_x:
        return max(1, int(match_x.group("n")))
    match_gae = MULT_GAE_RE.search(text)
    if match_gae:
        return max(1, int(match_gae.group("n")))
    return 1


def _nearest_pack(grams: int, sizes: tuple[int, ...]) -> int | None:
    if grams in sizes:
        return grams
    # 2kg 육회 → 1kg 팩 2개로 나누기 위해 호출부에서 처리
    for size in sorted(sizes, reverse=True):
        if grams % size == 0:
            return size
    return None


def parse_piece(piece: str, order_qty: int) -> list[ParsedLine]:
    text = str(piece).strip()
    if not text:
        return []

    spec = find_product(text)
    if spec is None or (is_excluded(text) and WEIGHT_RE.search(text) is None):
        if spec is None and not is_excluded(text) and text:
            return [
                ParsedLine(
                    original=text,
                    product="",
                    grams=None,
                    inner_qty=1,
                    order_qty=order_qty,
                    final_qty=0,
                    mode="unmatched",
                    note="미인식 품목",
                )
            ]
        return []

    weight_match = WEIGHT_RE.search(text)
    grams = _to_grams(weight_match.group("num"), weight_match.group("unit")) if weight_match else None
    inner = _inner_multiplier(text)

    lines: list[ParsedLine] = []
    if spec.mode == "pack_g":
        if grams is None:
            lines.append(
                ParsedLine(
                    original=text,
                    product=spec.canonical,
                    grams=None,
                    inner_qty=inner,
                    order_qty=order_qty,
                    final_qty=0,
                    mode="unmatched",
                    note="용량 없음",
                )
            )
            return lines

        pack_size = _nearest_pack(grams, spec.pack_sizes)
        if pack_size is None:
            packs = inner * order_qty
            lines.append(
                ParsedLine(
                    original=text,
                    product=spec.canonical,
                    grams=grams,
                    inner_qty=inner,
                    order_qty=order_qty,
                    final_qty=packs,
                    mode="extra_pack",
                    note="정의되지 않은 용량",
                )
            )
            return lines

        pack_count = (grams // pack_size) * inner * order_qty
        lines.append(
            ParsedLine(
                original=text,
                product=spec.canonical,
                grams=pack_size,
                inner_qty=inner,
                order_qty=order_qty,
                final_qty=pack_count,
                mode="pack_g",
            )
        )
        return lines

    # unit_g: 스지 2kg → 1kg 단위 2개
    unit_g = spec.unit_g
    if grams is None:
        units = float(inner * order_qty)
        note = f"용량 없음 → {unit_g}g 1단위로 가정"
    else:
        units = (grams / unit_g) * inner * order_qty
        note = ""
        if not math.isclose(units, round(units), rel_tol=0, abs_tol=1e-9):
            note = "단위가 정수로 떨어지지 않음"
    lines.append(
        ParsedLine(
            original=text,
            product=spec.canonical,
            grams=grams if grams is not None else unit_g,
            inner_qty=inner,
            order_qty=order_qty,
            final_qty=units,
            mode="unit_g",
            note=note,
        )
    )
    return lines


def parse_option_text(option_text: str, order_qty: int) -> list[ParsedLine]:
    if option_text is None or (isinstance(option_text, float) and math.isnan(option_text)):
        return []
    text = str(option_text).strip()
    if not text or text.lower() == "nan":
        return []
    qty = int(order_qty or 0)
    if qty <= 0:
        qty = 1
    pieces = PLUS_SPLIT_RE.split(text)
    result: list[ParsedLine] = []
    for piece in pieces:
        result.extend(parse_piece(piece, qty))
    return result


def accumulate(lines: list[ParsedLine], totals: DailyTotals) -> None:
    for line in lines:
        if line.mode == "unmatched":
            totals.unmatched.append(line.original)
            continue
        if line.mode == "pack_g":
            totals.add_pack(line.product, int(line.grams or 0), int(line.final_qty))
        elif line.mode == "extra_pack":
            totals.add_pack(line.product, int(line.grams or 0), int(line.final_qty))
        elif line.mode == "unit_g":
            totals.add_units(line.product, float(line.final_qty))
