from pathlib import Path

import pytest

from aggregator.excel_io import aggregate_orders, read_orders
from aggregator.summary import production_rows

ROOT = Path(__file__).resolve().parents[1]


def _sample_xls() -> Path:
    files = list(ROOT.glob("2026-09-14_EMP_*.xls"))
    if not files:
        pytest.skip("EMP 샘플 엑셀이 없습니다.")
    return files[0]


def test_emp_shipping_file_totals():
    df = read_orders(_sample_xls())
    totals, parsed, _detail = aggregate_orders(df)

    assert list(df.columns)[4] == "주문선택사항"
    assert list(df.columns)[5] == "주문수량"
    assert len(df) == 60

    assert totals.yukhoe[300] == 4
    assert totals.yukhoe[1000] == 12
    assert totals.yukashimi[300] == 2
    assert totals.yukashimi[500] == 4
    assert totals.suji_kg == 6
    assert totals.bulgogi_500g == 6
    assert totals.galbi_kg == 2
    assert totals.baepil_kg == 3
    assert totals.japuk_kg == 4
    assert totals.handon_japuk_500g == 2
    assert totals.satae_kg == 42
    assert totals.unmatched == []
    assert "고추장소스" not in " ".join(line.original for line in parsed)
    assert not any(line.product == "소고기 잡육" and "한돈" in line.original for line in parsed)

    by_name = {row["상품"]: row["총 개수"] for row in production_rows(totals, only_ordered=True)}
    assert by_name["육회 300g"] == 4
    assert by_name["육회 1kg"] == 12
    assert by_name["육사시미 300g"] == 2
    assert by_name["육사시미 500g"] == 4
    assert by_name["사태 1kg"] == 42
    assert "육회 200g" not in by_name
