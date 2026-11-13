import { NextResponse } from "next/server";
import { loadWatchBusinesses, saveWatchBusinesses } from "@/lib/supabase/saveProduction";
import { getSupabaseServerClient, missingSupabaseEnv } from "@/lib/supabase/server";

function noClient() {
  return NextResponse.json(
    { ok: false, error: `서버 환경변수가 없습니다: ${missingSupabaseEnv().join(", ")}` },
    { status: 500 },
  );
}

/** 확인 업체 목록. 저장한 적이 없으면 businesses가 null이고, 화면은 처음 목록을 씁니다. */
export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return noClient();
  const loaded = await loadWatchBusinesses(supabase);
  return NextResponse.json(loaded, { status: loaded.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  let body: { businesses?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body || !Array.isArray(body.businesses)) {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  const supabase = getSupabaseServerClient();
  if (!supabase) return noClient();
  const saved = await saveWatchBusinesses(supabase, body.businesses);
  return NextResponse.json(saved, { status: saved.ok ? 200 : 500 });
}
