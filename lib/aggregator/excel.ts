/** 엑셀 업로드 → 집계 */

import * as XLSX from "xlsx";
import { DailyTotals } from "./categories";
import {
  accumulate,
  parseOptionText,
  type ParsedLine,
} from "./parser";

export type ExcelValue = string | number | boolean | Date | null;

const OPTION_ALIASES = ["주문선택사항", "선택사항", "옵션", "주문옵션"] as const;
const QTY_ALIASES = ["주문수량", "수량", "개수"] as const;

export class ExcelFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExcelFormatError";
  }
}

function normalizeCol(name: unknown): string {
  return String(name ?? "")
    .replace(/\s+/g, "")
    .replace(/\n/g, "")
    .trim();
}

function valueText(value: ExcelValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function findColumn(
  columns: string[],
  aliases: readonly string[],
): string | null {
  const normalized = new Map(
    columns.map((c) => [normalizeCol(c), c] as const),
  );
  for (const alias of aliases) {
    const key = alias.replace(/\s+/g, "");
    const exact = normalized.get(key);
    if (exact) return exact;
    for (const [ncol, original] of normalized) {
      if (ncol.includes(key)) return original;
    }
  }
  return null;
}

function locateHeaderRow(raw: ExcelValue[][]): number {
  const maxScan = Math.min(20, raw.length);
  for (let idx = 0; idx < maxScan; idx++) {
    const values = (raw[idx] || []).map((v) => normalizeCol(v));
    const joined = values.join("|");
    if (joined.includes("주문선택사항") && joined.includes("주문수량")) {
      return idx;
    }
    if (
      values.some((v) => v.includes("주문선택")) &&
      values.some((v) => v.includes("수량"))
    ) {
      return idx;
    }
  }
  return 0;
}

export async function readOrdersMatrix(
  file: File,
): Promise<Record<string, ExcelValue>[]> {
  const extension = file.name.toLowerCase();
  if (!extension.endsWith(".xls") && !extension.endsWith(".xlsx")) {
    throw new ExcelFormatError(".xls 또는 .xlsx 파일만 올릴 수 있습니다.");
  }

  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, {
    type: "array",
    cellDates: false,
    cellText: true,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ExcelFormatError("엑셀 파일에 시트가 없습니다.");

  const matrix = XLSX.utils.sheet_to_json<ExcelValue[]>(
    workbook.Sheets[sheetName],
    {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    },
  );
  if (!matrix.length) throw new ExcelFormatError("엑셀 파일이 비어 있습니다.");

  const headerRow = locateHeaderRow(matrix);
  const header = (matrix[headerRow] || []).map((c, i) => {
    const text = valueText(c as ExcelValue);
    return text || `col_${i}`;
  });
  const body = matrix.slice(headerRow + 1);
  const rows: Record<string, ExcelValue>[] = [];
  for (const row of body) {
    const record: Record<string, ExcelValue> = {};
    let empty = true;
    header.forEach((col, i) => {
      const value = (row?.[i] ?? "") as ExcelValue;
      record[col] = value;
      if (valueText(value)) empty = false;
    });
    if (!empty) rows.push(record);
  }
  return rows;
}

export interface DetailRow {
  원문: string;
  품목: string;
  "용량(g)": number | null;
  묶음수량: number;
  주문수량: number;
  최종수량: number;
  구분: string;
  비고: string;
}

export function aggregateOrders(rows: Record<string, ExcelValue>[]): {
  totals: DailyTotals;
  parsed: ParsedLine[];
  detail: DetailRow[];
} {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const optionCol = findColumn(columns, OPTION_ALIASES);
  const qtyCol = findColumn(columns, QTY_ALIASES);
  if (!optionCol || !qtyCol) {
    throw new ExcelFormatError(
      `필수 열을 찾지 못했습니다. '주문선택사항'과 '주문수량' 열이 있는지 확인하세요. 현재 열: ${columns.join(", ")}`,
    );
  }

  const totals = new DailyTotals();
  const parsed: ParsedLine[] = [];
  for (const row of rows) {
    const option = row[optionCol];
    const qtyRaw = row[qtyCol];
    let qty = 1;
    try {
      const n = Number(qtyRaw);
      qty = Number.isFinite(n) ? Math.trunc(n) : 1;
      if (!qty) qty = 1;
    } catch {
      qty = 1;
    }
    const lines = parseOptionText(option, qty);
    parsed.push(...lines);
    accumulate(lines, totals);
  }

  const detail: DetailRow[] = parsed.map((line) => ({
    원문: line.original,
    품목: line.product || "(미인식)",
    "용량(g)": line.grams,
    묶음수량: line.innerQty,
    주문수량: line.orderQty,
    최종수량: line.finalQty,
    구분: line.mode,
    비고: line.note,
  }));

  return { totals, parsed, detail };
}
