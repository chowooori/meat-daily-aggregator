from aggregator.categories import DailyTotals
from aggregator.parser import parse_option_text
from aggregator.parser import accumulate


def _qty(lines, product, grams=None):
    total = 0.0
    for line in lines:
        if line.product != product:
            continue
        if grams is not None and line.grams != grams:
            continue
        total += line.final_qty
    return total


def test_split_set_and_exclude_sauce():
    lines = parse_option_text("육회 300g + 육사시미 300g + 소스", 1)
    meats = [line for line in lines if line.mode != "unmatched"]
    assert _qty(meats, "육회", 300) == 1
    assert _qty(meats, "육사시미", 300) == 1
    assert all("소스" not in line.original for line in meats)


def test_bundle_multiplier_x_and_exclude_sauce_count():
    lines = parse_option_text("육회 300g x 2 + 소스 2개", 1)
    assert _qty(lines, "육회", 300) == 2


def test_gae_multiplier():
    lines = parse_option_text("소불고기 500g 3개", 1)
    assert _qty(lines, "소불고기") == 3


def test_order_qty_multiplies_inner_qty():
    one = parse_option_text("육회 300g x 2", 1)
    two = parse_option_text("육회 300g x 2", 2)
    assert _qty(one, "육회", 300) == 2
    assert _qty(two, "육회", 300) == 4


def test_suji_kg_to_1kg_units():
    lines = parse_option_text("스지 2kg", 1)
    assert _qty(lines, "스지") == 2


def test_yukhoe_1kg_maps_to_1000g():
    lines = parse_option_text("육회 1kg", 2)
    assert _qty(lines, "육회", 1000) == 2


def test_baepil_with_space_and_kg():
    lines = parse_option_text("배 필 3kg", 1)
    assert _qty(lines, "배필") == 3


def test_handon_japuk_not_mixed_with_beef():
    pork = parse_option_text("한돈 잡육 500g", 2)
    beef = parse_option_text("소고기 잡육 1kg", 2)
    assert _qty(pork, "한돈 잡육") == 2
    assert _qty(beef, "소고기 잡육") == 2
    totals = DailyTotals()
    accumulate(pork + beef, totals)
    assert totals.handon_japuk_500g == 2
    assert totals.japuk_kg == 2


def test_yuksashimi_gae_and_order_qty():
    lines = parse_option_text("육사시미 500g 2개", 2)
    assert _qty(lines, "육사시미", 500) == 4


def test_accumulate_daily_totals():
    totals = DailyTotals()
    lines = []
    lines += parse_option_text("육회 300g x 2 + 육사시미 250g + 고추장소스", 2)
    lines += parse_option_text("스지 2kg", 1)
    lines += parse_option_text("소불고기 500g 3개", 1)
    accumulate(lines, totals)
    assert totals.yukhoe[300] == 4
    assert totals.yukashimi[250] == 2
    assert totals.suji_kg == 2
    assert totals.bulgogi_500g == 3
