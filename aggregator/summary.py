"""재고/제조용 용량별 총 개수."""

from __future__ import annotations

from aggregator.categories import DailyTotals, YUKASHIMI_SIZES, YUKHOE_SIZES


def format_size(grams: int) -> str:
    if grams >= 1000 and grams % 1000 == 0:
        kg = grams // 1000
        return f"{kg}kg" if kg != 1 else "1kg"
    return f"{grams}g"


def format_qty(value: float | int) -> int | float:
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def production_rows(totals: DailyTotals, *, only_ordered: bool = False) -> list[dict]:
    """상품 + 용량별 오늘 만들어야 할 개수."""
    rows: list[dict] = []

    def add(product: str, size: str, qty: float, grams: int | None = None) -> None:
        qty = format_qty(qty)
        if only_ordered and (not qty):
            return
        rows.append(
            {
                "상품": f"{product} {size}",
                "품목": product,
                "용량": size,
                "총 개수": qty,
                "grams": grams if grams is not None else 0,
            }
        )

    for grams in YUKASHIMI_SIZES:
        add("육사시미", format_size(grams), totals.yukashimi.get(grams, 0), grams)
    for grams in YUKHOE_SIZES:
        add("육회", format_size(grams), totals.yukhoe.get(grams, 0), grams)

    add("배필", "1kg", totals.baepil_kg, 1000)
    add("사태", "1kg", totals.satae_kg, 1000)
    add("소갈비", "1kg", totals.galbi_kg, 1000)
    add("소고기 잡육", "1kg", totals.japuk_kg, 1000)
    add("한돈 잡육", "500g", totals.handon_japuk_500g, 500)
    add("소불고기", "500g", totals.bulgogi_500g, 500)
    add("스지", "1kg", totals.suji_kg, 1000)

    for name, grams, packs in totals.extra_packs:
        add(name, format_size(grams), packs, grams)

    return rows
