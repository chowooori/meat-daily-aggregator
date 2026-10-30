import { describe, expect, it } from "vitest";
import { DailyTotals } from "@/lib/aggregator/categories";
import { accumulate, parseOptionText } from "@/lib/aggregator/parser";
import { savedRowsToTotals } from "@/lib/aggregator/savedRounds";
import { productionRows } from "@/lib/aggregator/summary";

function summary(totals: DailyTotals) {
  return productionRows(totals, { onlyOrdered: true }).map(
    (row) => `${row.상품}=${row["총 개수"]}`,
  );
}

describe("savedRowsToTotals", () => {
  it("rebuilds the same production rows that were saved", () => {
    const original = new DailyTotals();
    for (const [option, qty] of [
      ["육회 1kg", 3],
      ["육회 300g x 2 + 소스 2개", 1],
      ["육사시미 2kg", 1],
      ["육사시미 덩어리 2kg", 1],
      ["소고기 잡육 1kg", 4],
      ["한돈 잡육 500g", 2],
    ] as const) {
      accumulate(parseOptionText(option, qty), original);
    }

    const saved = productionRows(original, { onlyOrdered: true }).map((row) => ({
      product: row.품목,
      sizeG: row.grams,
      qty: Number(row["총 개수"]),
    }));

    expect(summary(savedRowsToTotals(saved))).toEqual(summary(original));
  });
});
