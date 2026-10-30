import { describe, expect, it } from "vitest";
import {
  combineBatches,
  MANUAL_ROUND,
  meatGroupSubtotals,
  roundLabel,
  sortRounds,
} from "@/lib/aggregator/batches";
import { DailyTotals } from "@/lib/aggregator/categories";
import {
  buildManualRows,
  manualLinesToTotals,
  sizeToGrams,
  type ManualLine,
} from "@/lib/aggregator/manual";
import { accumulate, parseOptionText } from "@/lib/aggregator/parser";

const line = (product: string, size: string, qty: number, memo = ""): ManualLine => ({
  id: `${product}-${size}`,
  product,
  size,
  qty,
  memo,
});

describe("manual entry", () => {
  it("labels the manual round and puts it after the numbered rounds", () => {
    expect(roundLabel(MANUAL_ROUND)).toBe("수동");
    expect(sortRounds([0, 2, 1])).toEqual([1, 2, 0]);
  });

  it("reads sizes in grams", () => {
    expect(sizeToGrams("500g")).toBe(500);
    expect(sizeToGrams("2kg")).toBe(2000);
    expect(sizeToGrams("?")).toBe(0);
  });

  it("adds manual lines as their own column next to the rounds", () => {
    const round1 = new DailyTotals();
    accumulate(parseOptionText("육회 1kg", 3), round1);
    const manual = manualLinesToTotals([
      line("육회", "1kg", 2, "○○식당"),
      line("육사시미", "2kg", 1),
      line("육사시미 덩어리", "1kg", 3),
      line("소불고기", "500g", 4),
    ]);

    const rows = combineBatches({ [MANUAL_ROUND]: manual, 1: round1 });
    const yukhoe = rows.find((r) => r.상품 === "육회 1kg");
    expect(yukhoe?.["1차"]).toBe(3);
    expect(yukhoe?.["수동"]).toBe(2);
    expect(yukhoe?.합계).toBe(5);
    expect(Object.keys(yukhoe ?? {}).indexOf("1차")).toBeLessThan(
      Object.keys(yukhoe ?? {}).indexOf("수동"),
    );
    expect(rows.find((r) => r.상품 === "소불고기 500g")?.["수동"]).toBe(4);

    const kg = meatGroupSubtotals(rows, [1, MANUAL_ROUND]);
    expect(kg.find((r) => r.품목 === "육사시미")?.["수동"]).toBe(5);
  });

  it("saves one row per manual line with the memo in the payload", () => {
    const rows = buildManualRows([line("육회", "1kg", 2, "○○식당"), line("사태", "1kg", 1)]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      row_no: 1,
      kind: "pack",
      category: "육회",
      size_label: "1kg",
      size_g: 1000,
      qty_total: 2,
      round_1: null,
      payload: { 메모: "○○식당" },
    });
    expect(rows[1].payload.메모).toBeNull();
  });
});
