import { describe, expect, it } from "vitest";
import {
  combineBatches,
  findOverRefunds,
  MANUAL_ROUND,
  meatGroupSubtotals,
  REFUND_ROUND,
  roundLabel,
  sortRounds,
} from "@/lib/aggregator/batches";
import { DailyTotals } from "@/lib/aggregator/categories";
import { manualLinesToTotals, type ManualLine } from "@/lib/aggregator/manual";
import { accumulate, parseOptionText } from "@/lib/aggregator/parser";

const line = (product: string, size: string, qty: number): ManualLine => ({
  id: `${product}-${size}-${qty}`,
  product,
  size,
  qty,
  memo: "",
});

function round(...options: Array<[string, number]>) {
  const totals = new DailyTotals();
  for (const [option, qty] of options) accumulate(parseOptionText(option, qty), totals);
  return totals;
}

describe("refunds", () => {
  it("labels refunds and puts them last", () => {
    expect(roundLabel(REFUND_ROUND)).toBe("환불");
    expect(sortRounds([REFUND_ROUND, 2, MANUAL_ROUND, 1])).toEqual([1, 2, MANUAL_ROUND, REFUND_ROUND]);
  });

  it("subtracts refunds from the total and shows them as negative", () => {
    const rows = combineBatches({
      1: round(["육회 1kg", 5]),
      2: round(["육회 1kg", 2], ["사태 1kg", 1]),
      [REFUND_ROUND]: manualLinesToTotals([line("육회", "1kg", 3)]),
    });
    const yukhoe = rows.find((r) => r.상품 === "육회 1kg");
    expect(yukhoe?.["환불"]).toBe(-3);
    expect(yukhoe?.합계).toBe(4);
    expect(rows.find((r) => r.상품 === "사태 1kg")?.["환불"]).toBe(0);
    expect(findOverRefunds(rows)).toEqual([]);
  });

  it("drops an item that was fully refunded and subtracts kg weight", () => {
    const rows = combineBatches({
      1: round(["육사시미 500g", 2], ["육회 300g", 1]),
      [REFUND_ROUND]: manualLinesToTotals([line("육사시미", "500g", 2)]),
    });
    expect(rows.find((r) => r.상품 === "육사시미 500g")).toBeUndefined();

    const all = combineBatches(
      {
        1: round(["육사시미 500g", 2]),
        [REFUND_ROUND]: manualLinesToTotals([line("육사시미", "500g", 1)]),
      },
      { onlyOrdered: false },
    );
    const kg = meatGroupSubtotals(all, [1, REFUND_ROUND]);
    expect(kg.find((r) => r.품목 === "육사시미")?.합계).toBe(0.5);
  });

  it("flags refunds larger than what was ordered", () => {
    const rows = combineBatches(
      {
        1: round(["육회 1kg", 2]),
        [REFUND_ROUND]: manualLinesToTotals([line("육회", "1kg", 5), line("스지", "1kg", 1)]),
      },
      { onlyOrdered: false },
    );
    expect(findOverRefunds(rows)).toEqual([
      { 상품: "육회 1kg", ordered: 2, refunded: 5 },
      { 상품: "스지 1kg", ordered: 0, refunded: 1 },
    ]);
  });
});
