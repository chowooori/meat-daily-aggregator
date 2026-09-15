from aggregator.batches import combine_batches, detect_round
from aggregator.excel_io import aggregate_orders, read_orders


def test_detect_round_from_filename():
    assert detect_round("2026-09-14_EMP_택배양식 01.xls") == 1
    assert detect_round("2026-09-15_EMP_택배양식 02.xls") == 2
    assert detect_round("2026-09-15_EMP_택배양식 03.xlsx") == 3
    assert detect_round("orders.xlsx", fallback=2) == 2


def test_combine_three_rounds():
    files = []
    root = __import__("pathlib").Path(__file__).resolve().parents[1]
    for path in sorted(root.glob("*EMP*.xls")):
        files.append(path)
    parent = root.parent
    for path in sorted(parent.glob("*EMP*.xls")):
        if path.name not in {p.name for p in files}:
            files.append(path)
    by_round = {}
    for path in files:
        round_no = detect_round(path.name)
        totals, _, _ = aggregate_orders(read_orders(path))
        if round_no in by_round:
            by_round[round_no].merge(totals)
        else:
            by_round[round_no] = totals
    if len(by_round) < 2:
        import pytest

        pytest.skip("01/02/03 샘플이 부족합니다.")
    rows = combine_batches(by_round, only_ordered=True)
    assert "1차" in rows[0]
    assert "합계" in rows[0]
    for row in rows:
        expected = sum(row.get(f"{r}차", 0) or 0 for r in by_round)
        assert row["합계"] == expected

    from aggregator.batches import meat_group_subtotals

    groups = meat_group_subtotals(combine_batches(by_round, only_ordered=False), sorted(by_round))
    by_name = {g["품목"]: g for g in groups}
    yukhoe_kg = by_name["육회"]
    yuka_kg = by_name["육사시미"]
    assert yukhoe_kg["1차"] == 13.2
    assert yuka_kg["1차"] == 2.6
    assert yukhoe_kg["합계"] == round(
        yukhoe_kg["1차"] + yukhoe_kg.get("2차", 0) + yukhoe_kg.get("3차", 0), 2
    )
