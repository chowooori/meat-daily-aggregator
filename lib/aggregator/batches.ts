/** 파일명 차수 인식과 차수별 용량 합계 */

import type { DailyTotals } from "./categories";
import { productionRows, type ProductionRow } from "./summary";

const ROUND_RE = /(?:^|[^\d])(\d{2})\.(?:xls|xlsx)$/i;

export function detectRound(filename: string, fallback?: number): number {
  const name = filename.split(/[/\\]/).pop() || filename;
  const match = ROUND_RE.exec(name);
  if (match) return Number(match[1]);
  if (fallback !== undefined) return fallback;
  return 1;
}

export function roundLabel(roundNo: number): string {
  return `${roundNo}차`;
}

export type CombinedRow = {
  상품: string;
  품목: string;
  용량: string;
  grams: number;
  합계: number;
  [key: string]: string | number;
};

export function combineBatches(
  batches: Record<number, DailyTotals>,
  options: { onlyOrdered?: boolean } = {},
): CombinedRow[] {
  const onlyOrdered = options.onlyOrdered ?? true;
  const byRound: Record<number, Record<string, ProductionRow>> = {};
  const orderedKeys: Array<[string, string, string, number]> = [];
  const seen = new Set<string>();

  for (const roundNo of Object.keys(batches)
    .map(Number)
    .sort((a, b) => a - b)) {
    const mapping: Record<string, ProductionRow> = {};
    for (const row of productionRows(batches[roundNo], { onlyOrdered: false })) {
      mapping[row.상품] = row;
      if (!seen.has(row.상품)) {
        seen.add(row.상품);
        orderedKeys.push([row.상품, row.품목, row.용량, row.grams || 0]);
      }
    }
    byRound[roundNo] = mapping;
  }

  const rounds = Object.keys(byRound)
    .map(Number)
    .sort((a, b) => a - b);
  const combined: CombinedRow[] = [];

  for (const [product, category, size, grams] of orderedKeys) {
    const rec: CombinedRow = {
      상품: product,
      품목: category,
      용량: size,
      grams,
      합계: 0,
    };
    let total = 0;
    for (const roundNo of rounds) {
      const row = byRound[roundNo]?.[product];
      const qty = row ? row["총 개수"] || 0 : 0;
      rec[roundLabel(roundNo)] = qty;
      total += Number(qty);
    }
    rec.합계 = total;
    if (onlyOrdered && !total) continue;
    combined.push(rec);
  }
  return combined;
}

export function meatGroupSubtotals(
  rows: CombinedRow[],
  rounds: number[],
): Array<Record<string, string | number>> {
  const roundCols = rounds.map(roundLabel);
  const result: Array<Record<string, string | number>> = [];
  for (const name of ["육사시미", "육회"] as const) {
    const kilos: Record<string, number> = Object.fromEntries(
      roundCols.map((col) => [col, 0]),
    );
    for (const row of rows) {
      if (row.품목 !== name) continue;
      const grams = Number(row.grams || 0);
      for (const col of roundCols) {
        const qty = Number(row[col] || 0);
        kilos[col] += (qty * grams) / 1000;
      }
    }
    const kiloTotal = Object.values(kilos).reduce((a, b) => a + b, 0);
    result.push({
      품목: name,
      단위: "kg",
      ...Object.fromEntries(
        roundCols.map((col) => [col, Math.round(kilos[col] * 100) / 100]),
      ),
      합계: Math.round(kiloTotal * 100) / 100,
    });
  }
  return result;
}
