import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { loadProductionDay, loadRestaurantNames } from "@/lib/supabase/saveProduction";

type Table = Record<string, unknown>[];

/** select·eq·in·order만 흉내 내는 최소한의 가짜 Supabase 클라이언트. */
function fakeClient(tables: Record<string, Table>): SupabaseClient {
  return {
    from(name: string) {
      let rows = [...(tables[name] ?? [])];
      const query = {
        select: () => query,
        eq(col: string, value: unknown) {
          rows = rows.filter((r) => r[col] === value);
          return query;
        },
        contains(col: string, values: unknown[]) {
          rows = rows.filter((r) =>
            values.every((v) => (r[col] as unknown[] | undefined)?.includes(v)),
          );
          return query;
        },
        in(col: string, values: unknown[]) {
          rows = rows.filter((r) => values.includes(r[col]));
          return query;
        },
        order(col: string, opts: { ascending: boolean }) {
          rows.sort((a, b) =>
            opts.ascending
              ? Number(a[col]) - Number(b[col])
              : Number(b[col]) - Number(a[col]),
          );
          return query;
        },
        then(resolve: (v: { data: Table; error: null }) => unknown) {
          return Promise.resolve(resolve({ data: rows, error: null }));
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

const row = (jobId: number, rowNo: number, extra: Record<string, unknown>) => ({
  job_id: jobId,
  row_no: rowNo,
  kind: "pack",
  round_1: null,
  round_2: null,
  round_3: null,
  ...extra,
});

describe("loadProductionDay", () => {
  it("picks the newest saved job per round and skips unfinished saves", async () => {
    const client = fakeClient({
      production_jobs: [
        { id: 10, report_date: "2000-01-01", status: "ok", rounds: [1], created_at: "t10" },
        { id: 11, report_date: "2000-01-01", status: "ok", rounds: [2], created_at: "t11" },
        { id: 12, report_date: "2000-01-01", status: "ok", rounds: [1], created_at: "t12" },
        { id: 13, report_date: "2000-01-01", status: "saving", rounds: [2], created_at: "t13" },
        { id: 14, report_date: "1999-12-31", status: "ok", rounds: [3], created_at: "t14" },
      ],
      production_rows: [
        row(10, 1, { category: "육회", size_label: "1kg", size_g: 1000, round_1: 9, qty_total: 9 }),
        row(11, 1, { category: "사태", size_label: "1kg", size_g: 1000, round_2: 2, qty_total: 2 }),
        row(12, 1, { category: "육회", size_label: "1kg", size_g: 1000, round_1: 4, qty_total: 4 }),
        row(12, 2, { kind: "group_kg", category: "육회", round_1: 4, qty_total: 4 }),
        row(13, 1, { category: "사태", size_label: "1kg", size_g: 1000, round_2: 99, qty_total: 99 }),
      ],
    });

    const loaded = await loadProductionDay(client, "2000-01-01");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.rounds.map((r) => [r.round, r.jobId, r.packCount])).toEqual([
      [1, 12, 4],
      [2, 11, 2],
    ]);
    expect(loaded.rounds[0].rows).toEqual([
      { product: "육회", sizeLabel: "1kg", sizeG: 1000, qty: 4 },
    ]);
  });

  it("reads each round from an older job that held several rounds", async () => {
    const client = fakeClient({
      production_jobs: [
        { id: 2, report_date: "2026-10-12", status: "ok", rounds: [1, 2], created_at: "t2" },
      ],
      production_rows: [
        row(2, 1, { category: "육회", size_label: "1kg", size_g: 1000, round_1: 3, round_2: 5, qty_total: 8 }),
      ],
    });

    const loaded = await loadProductionDay(client, "2026-10-12");
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.rounds.map((r) => [r.round, r.packCount])).toEqual([
      [1, 3],
      [2, 5],
    ]);
  });

  it("lists restaurant names from saved restaurant orders, most used first", async () => {
    const client = fakeClient({
      production_jobs: [
        { id: 20, status: "ok", rounds: [0] },
        { id: 21, status: "ok", rounds: [0] },
        { id: 22, status: "saving", rounds: [0] },
        { id: 23, status: "ok", rounds: [1] },
      ],
      production_rows: [
        { job_id: 20, payload: { 메모: "캥맥" } },
        { job_id: 20, payload: { 메모: "베테랑삼겹" } },
        { job_id: 21, payload: { 메모: "베테랑삼겹" } },
        { job_id: 21, payload: { 메모: null } },
        { job_id: 22, payload: { 메모: "저장 중 실패" } },
        { job_id: 23, payload: { 메모: "엑셀 차수" } },
      ],
    });

    const loaded = await loadRestaurantNames(client);
    expect(loaded).toEqual({ ok: true, names: ["베테랑삼겹", "캥맥"] });
  });
});
