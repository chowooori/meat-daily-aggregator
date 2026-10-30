/** 수동 입력: 엑셀 없이 화면에서 넣는 주문 줄 (식당 등 거래처 주문). */

import type { ProductionRowRecord } from "@/lib/supabase/saveProduction";
import { YUKASHIMI_SIZES, YUKHOE_SIZES } from "./categories";
import { savedRowsToTotals } from "./savedRounds";
import { formatSize } from "./summary";

export type ManualLine = {
  id: string;
  product: string;
  size: string;
  qty: number;
  memo: string;
};

/** 수동 입력에서 고를 수 있는 품목과 용량. 엑셀 집계 품목과 같은 목록입니다. */
export const MANUAL_CATALOG: ReadonlyArray<{ product: string; sizes: string[] }> = [
  { product: "육사시미", sizes: YUKASHIMI_SIZES.map(formatSize) },
  { product: "육사시미 덩어리", sizes: ["1kg"] },
  { product: "육회", sizes: YUKHOE_SIZES.map(formatSize) },
  { product: "배필", sizes: ["1kg"] },
  { product: "사태", sizes: ["1kg"] },
  { product: "소갈비", sizes: ["1kg"] },
  { product: "소고기 잡육", sizes: ["1kg"] },
  { product: "한돈 잡육", sizes: ["500g"] },
  { product: "소불고기", sizes: ["500g"] },
  { product: "스지", sizes: ["1kg"] },
];

export function sizesOf(product: string): string[] {
  return MANUAL_CATALOG.find((c) => c.product === product)?.sizes ?? [];
}

export function sizeToGrams(size: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(kg|g)$/i.exec(size.trim());
  if (!match) return 0;
  const value = Number(match[1]);
  return match[2].toLowerCase() === "kg" ? Math.round(value * 1000) : Math.round(value);
}

export function manualLinesToTotals(lines: ManualLine[]) {
  return savedRowsToTotals(
    lines.map((l) => ({ product: l.product, sizeG: sizeToGrams(l.size), qty: l.qty })),
  );
}

/** 수동 줄 하나를 저장 행 하나로 바꿉니다. 메모는 payload에 담습니다. */
export function buildManualRows(lines: ManualLine[]): ProductionRowRecord[] {
  return lines.map((l, idx) => ({
    row_no: idx + 1,
    kind: "pack",
    product: `${l.product} ${l.size}`,
    category: l.product,
    size_label: l.size,
    size_g: sizeToGrams(l.size) || null,
    unit: "개",
    round_1: null,
    round_2: null,
    round_3: null,
    qty_total: l.qty,
    payload: { 품목: l.product, 용량: l.size, 수량: l.qty, 메모: l.memo || null },
  }));
}

export function manualSignature(lines: ManualLine[]): string {
  return JSON.stringify(lines.map((l) => [l.product, l.size, l.qty, l.memo]));
}
