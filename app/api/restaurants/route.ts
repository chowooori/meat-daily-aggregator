import { NextResponse } from "next/server";
import { loadRestaurantNames } from "@/lib/supabase/saveProduction";
import { getSupabaseServerClient, missingSupabaseEnv } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: `서버 환경변수가 없습니다: ${missingSupabaseEnv().join(", ")}` },
      { status: 500 },
    );
  }
  const loaded = await loadRestaurantNames(supabase);
  return NextResponse.json(loaded, { status: loaded.ok ? 200 : 500 });
}
