/** DB에 저장된 차수 집계를 다시 DailyTotals로 되돌립니다. 그래야 업로드한 차수와 같은 표·엑셀·이미지 코드로 합칠 수 있습니다. */

import { DailyTotals } from "./categories";

type SavedRow = {
  product: string;
  sizeG: number | null;
  qty: number;
};

const PACK_PRODUCTS = new Set(["육사시미", "육회"]);

export function savedRowsToTotals(rows: SavedRow[]): DailyTotals {
  const totals = new DailyTotals();
  for (const row of rows) {
    if (!row.qty) continue;
    if (PACK_PRODUCTS.has(row.product)) {
      totals.addPack(row.product, Number(row.sizeG || 0), row.qty);
    } else {
      totals.addUnits(row.product, row.qty);
    }
  }
  return totals;
}
