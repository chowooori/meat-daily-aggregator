from pathlib import Path

import pandas as pd

root = Path(__file__).resolve().parents[1]
out = root / "scripts" / "_inspect_out.txt"
files = list(root.glob("*.xls")) + list(root.glob("*.xlsx"))
lines: list[str] = []
for f in files:
    engine = "xlrd" if f.suffix.lower() == ".xls" else "openpyxl"
    xl = pd.ExcelFile(f, engine=engine)
    lines.append(f"FILE={f.name}")
    lines.append(f"SHEETS={xl.sheet_names}")
    for sheet in xl.sheet_names:
        df = pd.read_excel(f, sheet_name=sheet, header=None, dtype=object, engine=engine)
        lines.append(f"SHAPE={df.shape}")
        lines.append("COLUMNS=" + " | ".join(str(v) for v in df.iloc[0].tolist()))
        lines.append("")
        option_idx = None
        qty_idx = None
        for i, v in enumerate(df.iloc[0].tolist()):
            s = str(v)
            if "주문선택" in s:
                option_idx = i
            if s.replace(" ", "") == "주문수량":
                qty_idx = i
        lines.append(f"option_idx={option_idx} qty_idx={qty_idx}")
        lines.append("--- ALL OPTION/QTY ---")
        for _, row in df.iloc[1:].iterrows():
            opt = row.iloc[option_idx] if option_idx is not None else None
            qty = row.iloc[qty_idx] if qty_idx is not None else None
            if pd.isna(opt) and pd.isna(qty):
                continue
            lines.append(f"{qty}\t{opt}")

out.write_text("\n".join(lines), encoding="utf-8")
print(out)
