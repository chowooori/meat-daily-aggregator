/** 재고/제조용 용량별 총 개수 */

import {
  DailyTotals,
  YUKASHIMI_SIZES,
  YUKHOE_SIZES,
} from "./categories";

export function formatSize(grams: number): string {
  if (grams >= 1000 && grams % 1000 === 0) {
    const kg = grams / 1000;
    return kg === 1 ? "1kg" : `${kg}kg`;
  }
  return `${grams}g`;
}

export function formatQty(value: number): number {
  if (Number.isInteger(value)) return value;
  if (Math.abs(value - Math.round(value)) < 1e-9) return Math.round(value);
  return value;
}

export interface ProductionRow {
  상품: string;
  품목: string;
  용량: string;
  "총 개수": number;
  grams: number;
}

export function productionRows(
  totals: DailyTotals,
  options: { onlyOrdered?: boolean } = {},
): ProductionRow[] {
  const onlyOrdered = options.onlyOrdered ?? false;
  const rows: ProductionRow[] = [];

  const add = (
    product: string,
    size: string,
    qty: number,
    grams: number | null = null,
  ) => {
    const formatted = formatQty(qty);
    if (onlyOrdered && !formatted) return;
    rows.push({
      상품: `${product} ${size}`,
      품목: product,
      용량: size,
      "총 개수": formatted,
      grams: grams ?? 0,
    });
  };

  for (const grams of YUKASHIMI_SIZES) {
    add("육사시미", formatSize(grams), totals.yukashimi[grams] || 0, grams);
  }
  for (const grams of YUKHOE_SIZES) {
    add("육회", formatSize(grams), totals.yukhoe[grams] || 0, grams);
  }

  add("배필", "1kg", totals.baepilKg, 1000);
  add("사태", "1kg", totals.sataeKg, 1000);
  add("소갈비", "1kg", totals.galbiKg, 1000);
  add("소고기 잡육", "1kg", totals.japukKg, 1000);
  add("한돈 잡육", "500g", totals.handonJapuk500g, 500);
  add("소불고기", "500g", totals.bulgogi500g, 500);
  add("스지", "1kg", totals.sujiKg, 1000);

  for (const [name, grams, packs] of totals.extraPacks) {
    add(name, formatSize(grams), packs, grams);
  }

  return rows;
}
