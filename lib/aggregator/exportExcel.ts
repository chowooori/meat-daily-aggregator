/** 일일 제조 수량표 엑셀 (브라우저) */

import * as XLSX from "xlsx";
import {
  combineBatches,
  meatGroupSubtotals,
  roundLabel,
} from "./batches";
import type { DailyTotals } from "./categories";
import { productionRows } from "./summary";

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function buildReportWorkbook(
  reportDate: Date,
  batches: Record<number, DailyTotals>,
): XLSX.WorkBook {
  const rounds = Object.keys(batches)
    .map(Number)
    .sort((a, b) => a - b);
  const rows = combineBatches(batches, { onlyOrdered: false });
  const qtyHeaders = [...rounds.map(roundLabel), "합계"];
  const headers = ["상품", "품목", "용량", ...qtyHeaders];

  const aoa: (string | number)[][] = [];
  aoa.push(["당일 주문 용량별 제조 수량 (차수별)"]);
  aoa.push([
    `${reportDate.getFullYear()}년 ${reportDate.getMonth() + 1}월 ${reportDate.getDate()}일  /  ${rounds.map(roundLabel).join(", ")}  /  파일명 01·02·03 = 1차·2차·3차`,
  ]);
  aoa.push([]);
  aoa.push(headers);

  let orderedCount = 0;
  for (const row of rows) {
    const total = Number(row.합계 || 0);
    if (total) orderedCount += 1;
    aoa.push([
      String(row.상품),
      String(row.품목),
      String(row.용량),
      ...qtyHeaders.map((h) => Number(row[h] || 0)),
    ]);
  }

  aoa.push([]);
  aoa.push(["육회·육사시미 전용량 중량(kg)"]);
  aoa.push(["품목", "단위", "", ...qtyHeaders]);
  const groupRows = meatGroupSubtotals(rows, rounds);
  for (const grow of groupRows) {
    aoa.push([
      String(grow.품목),
      String(grow.단위 ?? "kg"),
      "",
      ...qtyHeaders.map((h) => Number(grow[h] || 0)),
    ]);
  }
  aoa.push([]);
  aoa.push(["주문 있는 상품 수", "", "", ...qtyHeaders.slice(0, -1).map(() => ""), orderedCount]);

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 12 },
    ...qtyHeaders.map(() => ({ wch: 12 })),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "차수별 총개수");
  return wb;
}

export function reportBytes(
  reportDate: Date,
  batches: Record<number, DailyTotals>,
): ArrayBuffer {
  const wb = buildReportWorkbook(reportDate, batches);
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

export function reportFileName(reportDate: Date): string {
  return `일일생산집계표_${ymd(reportDate)}.xlsx`;
}

export function singleBatchRows(totals: DailyTotals) {
  return productionRows(totals, { onlyOrdered: false });
}
