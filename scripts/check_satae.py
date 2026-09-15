from pathlib import Path

import pandas as pd

from aggregator.excel_io import read_orders

root = Path(__file__).resolve().parents[1]
xls = next(root.glob("2026-09-14_EMP_*.xls"))
df = read_orders(xls)
opt = df["주문선택사항"].astype(str)
mask = opt.str.contains("사태")
qty = pd.to_numeric(df.loc[mask, "주문수량"], errors="coerce").fillna(0)
out = root / "scripts" / "satae_check.txt"
lines = [f"{q}\t{t}" for q, t in zip(df.loc[mask, "주문수량"], df.loc[mask, "주문선택사항"])]
lines.append(f"SUM={qty.sum()} COUNT={mask.sum()}")
out.write_text("\n".join(lines), encoding="utf-8")
print(out)
