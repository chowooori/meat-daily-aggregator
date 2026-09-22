import { describe, expect, it } from "vitest";
import { buildProductionRows } from "@/lib/supabase/saveProduction";

describe("buildProductionRows", () => {
  it("maps pack and kg group rows", () => {
    const rows = buildProductionRows(
      [
        {
          상품: "육회 300g",
          품목: "육회",
          용량: "300g",
          grams: 300,
          "1차": 2,
          "2차": 1,
          합계: 3,
        },
      ],
      [
        {
          품목: "육회",
          단위: "kg",
          "1차": 0.6,
          "2차": 0.3,
          합계: 0.9,
        },
      ],
      [1, 2],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: "pack",
      product: "육회 300g",
      category: "육회",
      size_label: "300g",
      size_g: 300,
      unit: "개",
      round_1: 2,
      round_2: 1,
      round_3: null,
      qty_total: 3,
    });
    expect(rows[1]).toMatchObject({
      kind: "group_kg",
      product: "육회",
      unit: "kg",
      round_1: 0.6,
      round_2: 0.3,
      qty_total: 0.9,
    });
  });
});
