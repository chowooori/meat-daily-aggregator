import { NextResponse } from "next/server";
import {
  insertProductionJob,
  type ProductionRowRecord,
  type SaveProductionInput,
} from "@/lib/supabase/saveProduction";
import { getSupabaseServerClient, missingSupabaseEnv } from "@/lib/supabase/server";

const MAX_ROWS = 1000;

export async function POST(request: Request) {
  let body: SaveProductionInput & { reportDate: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (Array.isArray(body.rows) && body.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, error: `한 번에 ${MAX_ROWS}행까지만 저장할 수 있습니다.` },
      { status: 413 },
    );
  }

  const rawDate = String(body.reportDate || "");
  const reportDate = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
    ? new Date(`${rawDate.slice(0, 10)}T12:00:00`)
    : new Date(rawDate);
  if (Number.isNaN(reportDate.getTime())) {
    return NextResponse.json({ ok: false, error: "생산일자가 없습니다." }, { status: 400 });
  }

  const input: SaveProductionInput = {
    reportDate,
    sourceFiles: Array.isArray(body.sourceFiles) ? body.sourceFiles.map(String) : [],
    rounds: Array.isArray(body.rounds) ? body.rounds.map(Number) : [],
    skuCount: Number(body.skuCount) || 0,
    packCount: Number(body.packCount) || 0,
    unmatchedCount: Number(body.unmatchedCount) || 0,
    status: String(body.status || "ok"),
    message: String(body.message || ""),
    rows: Array.isArray(body.rows) ? (body.rows as ProductionRowRecord[]) : [],
  };
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: `서버 환경변수가 없습니다: ${missingSupabaseEnv().join(", ")}` },
      { status: 500 },
    );
  }
  const saved = await insertProductionJob(supabase, input);
  return NextResponse.json(saved, { status: saved.ok ? 200 : 500 });
}
