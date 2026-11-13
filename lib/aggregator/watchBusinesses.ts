/** 확인 업체: 특수한 요구사항이 있어 그날 주문이 있으면 작업장이 꼭 확인해야 하는 업체. */

import type { ProductionRowRecord } from "@/lib/supabase/saveProduction";
import { roundLabel, sortRounds } from "./batches";
import { DailyTotals } from "./categories";
import type { ParsedLine } from "./parser";
import { accumulate } from "./parser";
import { productionRows } from "./summary";

export type WatchBusiness = {
  /** 배송지주소·수령자명·식당 이름에서 찾을 업체 이름. */
  name: string;
  /** 안내 문구 끝에 붙이는 요구사항 한 줄. 없으면 빈 문자열. */
  note: string;
};

/** 업체가 생기면 여기에 추가합니다. */
export const WATCH_BUSINESSES: readonly WatchBusiness[] = [
  { name: "육회챱챱", note: "200g 소분포장" },
];

/** 확인 업체 주문 한 건(업체·상품·수량·차수). 주소나 수령자명은 담지 않습니다. */
export type WatchHit = {
  business: string;
  item: string;
  qty: number;
  round: number;
};

const compact = (text: unknown) => String(text ?? "").replace(/\s+/g, "");

/** 주소·수령자명·식당 이름 중 하나에 업체 이름이 들어 있으면 그 업체를 돌려줍니다. */
export function matchWatchBusiness(
  texts: unknown[],
  businesses: readonly WatchBusiness[] = WATCH_BUSINESSES,
): WatchBusiness | null {
  const haystack = texts.map(compact).join("|");
  return businesses.find((b) => haystack.includes(compact(b.name))) ?? null;
}

/** 한 업체의 해석된 주문 줄을 "육회 1kg" 같은 제조 단위 수량으로 바꿉니다. */
export function watchItems(lines: ParsedLine[]): Array<{ item: string; qty: number }> {
  const totals = new DailyTotals();
  accumulate(lines, totals);
  return productionRows(totals, { onlyOrdered: true }).map((row) => ({
    item: row.상품,
    qty: Number(row["총 개수"]),
  }));
}

/** 같은 업체·상품·차수를 합칩니다. */
export function mergeWatchHits(hits: WatchHit[]): WatchHit[] {
  const merged = new Map<string, WatchHit>();
  for (const hit of hits) {
    const key = `${hit.business}|${hit.item}|${hit.round}`;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, qty: prev.qty + hit.qty } : { ...hit });
  }
  return [...merged.values()];
}

function fmt(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100);
}

/** 업체마다 한 줄: "육회챱챱: 육회 1kg 4개(1차) 주문 있어요 · 200g 소분포장" */
export function watchNotices(
  hits: WatchHit[],
  businesses: readonly WatchBusiness[] = WATCH_BUSINESSES,
): string[] {
  const merged = mergeWatchHits(hits);
  return businesses
    .map((b) => {
      const own = merged.filter((h) => h.business === b.name && h.qty > 0);
      if (!own.length) return "";
      const order = sortRounds([...new Set(own.map((h) => h.round))]);
      const parts = own
        .sort((x, y) => order.indexOf(x.round) - order.indexOf(y.round))
        .map((h) => `${h.item} ${fmt(h.qty)}개(${roundLabel(h.round)})`);
      return `${b.name}: ${parts.join(", ")} 주문 있어요${b.note ? ` · ${b.note}` : ""}`;
    })
    .filter(Boolean);
}

/** 차수를 저장할 때 안내에 쓸 확인 업체 주문만 함께 저장합니다(주소 없이). */
export function buildWatchRows(hits: WatchHit[], startRowNo: number): ProductionRowRecord[] {
  return mergeWatchHits(hits).map((hit, idx) => ({
    row_no: startRowNo + idx,
    kind: "watch",
    product: hit.business,
    category: hit.item,
    size_label: null,
    size_g: null,
    unit: "개",
    round_1: null,
    round_2: null,
    round_3: null,
    qty_total: hit.qty,
    payload: { 업체: hit.business, 상품: hit.item, 수량: hit.qty },
  }));
}
