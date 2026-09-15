from pathlib import Path

import pandas as pd

root = Path(__file__).resolve().parents[1]
files = list(root.glob("*.xls")) + list(root.glob("*.xlsx"))
print("FILES", [f.name for f in files])
pd.set_option("display.max_columns", 80)
pd.set_option("display.width", 240)
pd.set_option("display.max_colwidth", 120)
pd.set_option("display.max_rows", 50)

for f in files:
    print("===", f.name, "===")
    engine = "xlrd" if f.suffix.lower() == ".xls" else "openpyxl"
    xl = pd.ExcelFile(f, engine=engine)
    print("sheets", xl.sheet_names)
    for sheet in xl.sheet_names:
        df = pd.read_excel(f, sheet_name=sheet, header=None, dtype=object, engine=engine)
        print("sheet", sheet, "shape", df.shape)
        print(df.head(12).to_string())
        print("--- row0 ---")
        print(list(df.iloc[0]))
        if len(df) > 1:
            print("--- row1 ---")
            print(list(df.iloc[1]))
        print()
