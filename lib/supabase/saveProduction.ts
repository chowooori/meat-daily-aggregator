import { getSupabaseBrowserClient } from "./client";

const BATCH_SIZE = 200;

export type ProductionRowKind = "pack" | "group_kg";

export interface ProductionRowRecord {
  row_no: number;
  kind: ProductionRowKind;
  product: string | null;
  category: string | null;
  size_label: string | null;
  size_g: number | null;
  unit: string;
  round_1: number | null;
  round_2: number | null;
  round_3: number | null;
  qty_total: number | null;
  payload: Record<string, string | number | null>;
}

export interface SaveProductionInput {
  reportDate: Date;
  sourceFiles: string[];
  rounds: number[];
  skuCount: number;
  packCount: number;
  unmatchedCount: number;
  status: string;
  message: string;
  rows: ProductionRowRecord[];
}

export interface SaveProductionResult {
  ok: boolean;
  jobId?: number;
  error?: string;
}

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function roundQty(
  row: Record<string, string | number>,
  roundNo: number,
): number | null {
  const key = `${roundNo}차`;
  if (!(key in row)) return null;
  const n = Number(row[key] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function buildProductionRows(
  packRows: Array<Record<string, string | number>>,
  groupRows: Array<Record<string, string | number>>,
  rounds: number[],
): ProductionRowRecord[] {
  const records: ProductionRowRecord[] = [];
  let rowNo = 1;

  for (const row of packRows) {
    records.push({
      row_no: rowNo++,
      kind: "pack",
      product: String(row.상품 ?? row.품목 ?? ""),
      category: String(row.품목 ?? row.구분 ?? ""),
      size_label: String(row.용량 ?? ""),
      size_g: Number(row.grams || 0) || null,
      unit: "개",
      round_1: rounds.includes(1) ? roundQty(row, 1) : null,
      round_2: rounds.includes(2) ? roundQty(row, 2) : null,
      round_3: rounds.includes(3) ? roundQty(row, 3) : null,
      qty_total: Number(row.합계 ?? 0) || 0,
      payload: {
        상품: String(row.상품 ?? ""),
        품목: String(row.품목 ?? ""),
        용량: String(row.용량 ?? ""),
        합계: Number(row.합계 ?? 0),
      },
    });
  }

  for (const row of groupRows) {
    records.push({
      row_no: rowNo++,
      kind: "group_kg",
      product: String(row.품목 ?? ""),
      category: String(row.품목 ?? ""),
      size_label: String(row.단위 ?? "kg"),
      size_g: null,
      unit: "kg",
      round_1: rounds.includes(1) ? roundQty(row, 1) : null,
      round_2: rounds.includes(2) ? roundQty(row, 2) : null,
      round_3: rounds.includes(3) ? roundQty(row, 3) : null,
      qty_total: Number(row.합계 ?? 0) || 0,
      payload: {
        품목: String(row.품목 ?? ""),
        단위: String(row.단위 ?? "kg"),
        합계: Number(row.합계 ?? 0),
      },
    });
  }

  return records;
}

export async function saveProductionJob(
  input: SaveProductionInput,
): Promise<SaveProductionResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      ok: false,
      error: "슈파베이스 환경변수가 없습니다.",
    };
  }

  const { data: job, error: jobError } = await supabase
    .from("production_jobs")
    .insert({
      report_date: ymd(input.reportDate),
      source_files: input.sourceFiles,
      rounds: input.rounds,
      sku_count: input.skuCount,
      pack_count: input.packCount,
      unmatched_count: input.unmatchedCount,
      status: input.status,
      message: input.message,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return {
      ok: false,
      error: jobError?.message ?? "집계 작업을 저장하지 못했습니다.",
    };
  }

  const jobId = job.id as number;
  for (let start = 0; start < input.rows.length; start += BATCH_SIZE) {
    const chunk = input.rows.slice(start, start + BATCH_SIZE).map((row) => ({
      ...row,
      job_id: jobId,
    }));
    const { error: rowError } = await supabase
      .from("production_rows")
      .insert(chunk);
    if (rowError) {
      return {
        ok: false,
        jobId,
        error: rowError.message,
      };
    }
  }

  return { ok: true, jobId };
}
