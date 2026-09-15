from datetime import date
from pathlib import Path

from aggregator.batches import combine_batches, detect_round
from aggregator.excel_export import report_bytes
from aggregator.excel_io import aggregate_orders, read_orders

root = Path(__file__).resolve().parents[1]
files = sorted(root.glob("*EMP*.xls"), key=lambda p: detect_round(p.name))
batches = {}
for path in files:
    round_no = detect_round(path.name)
    totals, _, _ = aggregate_orders(read_orders(path))
    if round_no in batches:
        batches[round_no].merge(totals)
    else:
        batches[round_no] = totals

rows = combine_batches(batches, only_ordered=True)
lines = ["\t".join(["상품", "용량"] + [f"{r}차" for r in sorted(batches)] + ["합계"])]
for row in rows:
    cols = [row["상품"], row["용량"]] + [str(row.get(f"{r}차", 0)) for r in sorted(batches)] + [str(row["합계"])]
    lines.append("\t".join(cols))
out = root / "scripts" / "emp_verify.txt"
out.write_text("\n".join(lines), encoding="utf-8")
(root / "일일생산집계표_차수별.xlsx").write_bytes(report_bytes(batches=batches, report_date=date(2026, 9, 15)))
print(out)
print("files", [p.name for p in files])
