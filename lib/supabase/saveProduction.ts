import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanWatchBusinesses,
  type WatchBusiness,
} from "@/lib/aggregator/watchBusinesses";

const BATCH_SIZE = 200;

/** watch: 확인 업체 주문(안내 문구용, 주소 없음). */
export type ProductionRowKind = "pack" | "group_kg" | "watch" | "watch_business";

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

export async function insertProductionJob(
  supabase: SupabaseClient,
  input: SaveProductionInput,
): Promise<SaveProductionResult> {
  const { data: job, error: jobError } = await supabase
    .from("production_jobs")
    .insert({
      report_date: ymd(input.reportDate),
      source_files: input.sourceFiles,
      rounds: input.rounds,
      sku_count: input.skuCount,
      pack_count: input.packCount,
      unmatched_count: input.unmatchedCount,
      // 행까지 다 들어가기 전에는 불러오기에서 빠지도록 "saving"으로 넣습니다.
      status: "saving",
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
    const { error: rowError } = await supabase.from("production_rows").insert(chunk);
    if (rowError) {
      await supabase.from("production_jobs").delete().eq("id", jobId);
      return {
        ok: false,
        error: rowError.message,
      };
    }
  }

  const { error: statusError } = await supabase
    .from("production_jobs")
    .update({ status: input.status })
    .eq("id", jobId);
  if (statusError) {
    return { ok: false, error: statusError.message };
  }

  return { ok: true, jobId };
}

export interface SavedRoundRow {
  product: string;
  sizeLabel: string;
  sizeG: number | null;
  qty: number;
  /** 식당 주문 줄의 식당 이름. 엑셀 차수에는 없습니다. */
  memo?: string;
}

/** 한 날짜에서 차수별로 가장 최근에 저장된 집계. round 0은 식당 주문 묶음입니다. */
export interface SavedRound {
  round: number;
  jobId: number;
  savedAt: string;
  packCount: number;
  rows: SavedRoundRow[];
  /** 저장해 둔 확인 업체 주문. 안내 문구를 다시 만들 때 씁니다. */
  watch: Array<{ business: string; item: string; qty: number }>;
}

type JobRecord = {
  id: number;
  created_at: string;
  rounds: number[] | null;
};

type RowRecord = {
  job_id: number;
  kind?: string;
  category: string | null;
  product: string | null;
  size_label: string | null;
  size_g: number | null;
  round_1: number | string | null;
  round_2: number | string | null;
  round_3: number | string | null;
  qty_total: number | string | null;
  payload: Record<string, unknown> | null;
};

function savedRoundQty(row: RowRecord, round: number, jobRounds: number[]): number {
  const key = `round_${round}` as "round_1" | "round_2" | "round_3";
  const value = round >= 1 && round <= 3 ? row[key] : null;
  if (value !== null && value !== undefined) return Number(value) || 0;
  // 차수 하나만 담은 job은 합계가 곧 그 차수 수량입니다.
  return jobRounds.length === 1 ? Number(row.qty_total) || 0 : 0;
}

export async function loadProductionDay(
  supabase: SupabaseClient,
  reportDate: string,
): Promise<{ ok: true; rounds: SavedRound[] } | { ok: false; error: string }> {
  const { data: jobs, error: jobError } = await supabase
    .from("production_jobs")
    .select("id, created_at, rounds")
    .eq("report_date", reportDate)
    .in("status", ["ok", "partial"])
    .order("id", { ascending: false });
  if (jobError) return { ok: false, error: jobError.message };

  const latest = new Map<number, JobRecord>();
  for (const job of (jobs ?? []) as JobRecord[]) {
    for (const round of job.rounds ?? []) {
      if (!latest.has(round)) latest.set(round, job);
    }
  }
  if (!latest.size) return { ok: true, rounds: [] };

  const jobIds = [...new Set([...latest.values()].map((job) => job.id))];
  const { data: rows, error: rowError } = await supabase
    .from("production_rows")
    .select("job_id, kind, category, product, size_label, size_g, round_1, round_2, round_3, qty_total, payload")
    .in("job_id", jobIds)
    .in("kind", ["pack", "watch"])
    .order("row_no", { ascending: true });
  if (rowError) return { ok: false, error: rowError.message };

  const rounds: SavedRound[] = [...latest.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, job]) => {
      const jobRounds = job.rounds ?? [];
      const jobRows = ((rows ?? []) as RowRecord[]).filter((row) => row.job_id === job.id);
      const watch = jobRows
        .filter((row) => row.kind === "watch")
        .map((row) => ({
          business: String(row.product ?? ""),
          item: String(row.category ?? ""),
          qty: savedRoundQty(row, round, jobRounds),
        }))
        .filter((row) => row.qty > 0);
      const roundRows = jobRows
        .filter((row) => row.kind !== "watch")
        .map((row) => ({
          product: String(row.category || row.product || ""),
          sizeLabel: String(row.size_label ?? ""),
          sizeG: row.size_g === null ? null : Number(row.size_g),
          qty: savedRoundQty(row, round, jobRounds),
          ...(typeof row.payload?.["메모"] === "string" && row.payload["메모"]
            ? { memo: row.payload["메모"] as string }
            : {}),
        }))
        .filter((row) => row.qty > 0);
      return {
        round,
        jobId: job.id,
        savedAt: job.created_at,
        packCount: roundRows.reduce((sum, row) => sum + row.qty, 0),
        rows: roundRows,
        watch,
      };
    });
  return { ok: true, rounds };
}

export async function fetchSavedRounds(
  reportDate: string,
): Promise<{ ok: true; rounds: SavedRound[] } | { ok: false; error: string }> {
  try {
    const response = await fetch(
      `/api/production?date=${encodeURIComponent(reportDate)}`,
    );
    const body = await response.json();
    if (!response.ok || !body.ok) {
      return { ok: false, error: body.error || "저장된 집계를 불러오지 못했습니다." };
    }
    return { ok: true, rounds: body.rounds as SavedRound[] };
  } catch {
    return { ok: false, error: "저장된 집계를 불러오지 못했습니다." };
  }
}

export async function saveProductionJob(
  input: SaveProductionInput,
): Promise<SaveProductionResult> {
  const response = await fetch("/api/production", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      reportDate: ymd(input.reportDate),
    }),
  });
  const body = (await response.json()) as SaveProductionResult;
  if (!response.ok || !body.ok) {
    return { ok: false, error: body.error || "저장에 실패했습니다." };
  }
  return body;
}

/** 지금까지 저장한 식당 주문(차수 0)에 나온 식당 이름. 자주 쓴 이름이 먼저 옵니다. */
export async function loadRestaurantNames(
  supabase: SupabaseClient,
): Promise<{ ok: true; names: string[] } | { ok: false; error: string }> {
  const { data: jobs, error: jobError } = await supabase
    .from("production_jobs")
    .select("id")
    .contains("rounds", [0])
    .in("status", ["ok", "partial"]);
  if (jobError) return { ok: false, error: jobError.message };
  const jobIds = ((jobs ?? []) as { id: number }[]).map((job) => job.id);
  if (!jobIds.length) return { ok: true, names: [] };

  const { data: rows, error: rowError } = await supabase
    .from("production_rows")
    .select("payload")
    .in("job_id", jobIds);
  if (rowError) return { ok: false, error: rowError.message };

  const counts = new Map<string, number>();
  for (const row of (rows ?? []) as { payload: Record<string, unknown> | null }[]) {
    const name = row.payload?.["메모"];
    if (typeof name !== "string" || !name.trim()) continue;
    counts.set(name.trim(), (counts.get(name.trim()) ?? 0) + 1);
  }
  const names = [...counts.entries()]
    .sort(([a, ca], [b, cb]) => cb - ca || a.localeCompare(b, "ko"))
    .map(([name]) => name);
  return { ok: true, names };
}

export async function fetchRestaurantNames(): Promise<string[]> {
  try {
    const response = await fetch("/api/restaurants");
    const body = await response.json();
    return response.ok && body.ok ? (body.names as string[]) : [];
  } catch {
    return [];
  }
}

/** 확인 업체 목록은 날짜와 상관없는 설정이라, 이 표에 날짜 1900-01-01·차수 -9 묶음으로 저장합니다. 최신 저장분이 현재 목록입니다. */
export const WATCH_SETTINGS_ROUND = -9;
const WATCH_SETTINGS_DATE = "1900-01-01";

export async function loadWatchBusinesses(
  supabase: SupabaseClient,
): Promise<{ ok: true; businesses: WatchBusiness[] | null } | { ok: false; error: string }> {
  const { data: jobs, error: jobError } = await supabase
    .from("production_jobs")
    .select("id")
    .eq("report_date", WATCH_SETTINGS_DATE)
    .contains("rounds", [WATCH_SETTINGS_ROUND])
    .in("status", ["ok"])
    .order("id", { ascending: false })
    .limit(1);
  if (jobError) return { ok: false, error: jobError.message };
  const latest = ((jobs ?? []) as { id: number }[])[0];
  if (!latest) return { ok: true, businesses: null };

  const { data: rows, error: rowError } = await supabase
    .from("production_rows")
    .select("product, payload")
    .eq("job_id", latest.id)
    .order("row_no", { ascending: true });
  if (rowError) return { ok: false, error: rowError.message };
  return {
    ok: true,
    businesses: cleanWatchBusinesses(
      ((rows ?? []) as { product: string | null; payload: Record<string, unknown> | null }[]).map(
        (row) => ({ name: row.product ?? "", note: String(row.payload?.["요구사항"] ?? "") }),
      ),
    ),
  };
}

export async function saveWatchBusinesses(
  supabase: SupabaseClient,
  input: unknown,
): Promise<SaveProductionResult & { businesses?: WatchBusiness[] }> {
  const businesses = cleanWatchBusinesses(input);
  const saved = await insertProductionJob(supabase, {
    reportDate: new Date(1900, 0, 1),
    sourceFiles: [],
    rounds: [WATCH_SETTINGS_ROUND],
    skuCount: businesses.length,
    packCount: 0,
    unmatchedCount: 0,
    status: "ok",
    message: `확인 업체 ${businesses.length}곳`,
    rows: businesses.map((b, idx) => ({
      row_no: idx + 1,
      kind: "watch_business",
      product: b.name,
      category: null,
      size_label: null,
      size_g: null,
      unit: "곳",
      round_1: null,
      round_2: null,
      round_3: null,
      qty_total: null,
      payload: { 업체: b.name, 요구사항: b.note },
    })),
  });
  return saved.ok ? { ...saved, businesses } : saved;
}

export async function fetchWatchBusinesses(): Promise<WatchBusiness[] | null> {
  try {
    const response = await fetch("/api/watch-businesses");
    const body = await response.json();
    return response.ok && body.ok ? (body.businesses as WatchBusiness[] | null) : null;
  } catch {
    return null;
  }
}

export async function postWatchBusinesses(
  businesses: WatchBusiness[],
): Promise<{ ok: true; businesses: WatchBusiness[] } | { ok: false; error: string }> {
  try {
    const response = await fetch("/api/watch-businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businesses }),
    });
    const body = await response.json();
    if (!response.ok || !body.ok) return { ok: false, error: body.error || "저장하지 못했습니다." };
    return { ok: true, businesses: body.businesses as WatchBusiness[] };
  } catch {
    return { ok: false, error: "저장하지 못했습니다." };
  }
}
