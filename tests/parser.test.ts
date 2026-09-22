import { describe, expect, it } from "vitest";
import { DailyTotals } from "@/lib/aggregator/categories";
import { accumulate, parseOptionText } from "@/lib/aggregator/parser";

function qty(
  lines: ReturnType<typeof parseOptionText>,
  product: string,
  grams?: number,
) {
  let total = 0;
  for (const line of lines) {
    if (line.product !== product) continue;
    if (grams !== undefined && line.grams !== grams) continue;
    total += line.finalQty;
  }
  return total;
}

describe("parser", () => {
  it("splits set and excludes sauce", () => {
    const lines = parseOptionText("육회 300g + 육사시미 300g + 소스", 1);
    const meats = lines.filter((line) => line.mode !== "unmatched");
    expect(qty(meats, "육회", 300)).toBe(1);
    expect(qty(meats, "육사시미", 300)).toBe(1);
    expect(meats.every((line) => !line.original.includes("소스"))).toBe(true);
  });

  it("applies x multiplier and excludes sauce count", () => {
    const lines = parseOptionText("육회 300g x 2 + 소스 2개", 1);
    expect(qty(lines, "육회", 300)).toBe(2);
  });

  it("reads 개 multiplier", () => {
    const lines = parseOptionText("소불고기 500g 3개", 1);
    expect(qty(lines, "소불고기")).toBe(3);
  });

  it("multiplies order qty by inner qty", () => {
    const one = parseOptionText("육회 300g x 2", 1);
    const two = parseOptionText("육회 300g x 2", 2);
    expect(qty(one, "육회", 300)).toBe(2);
    expect(qty(two, "육회", 300)).toBe(4);
  });

  it("converts suji kg to 1kg units", () => {
    const lines = parseOptionText("스지 2kg", 1);
    expect(qty(lines, "스지")).toBe(2);
  });

  it("maps yukhoe 1kg to 1000g", () => {
    const lines = parseOptionText("육회 1kg", 2);
    expect(qty(lines, "육회", 1000)).toBe(2);
  });

  it("parses baepil with space and kg", () => {
    const lines = parseOptionText("배 필 3kg", 1);
    expect(qty(lines, "배필")).toBe(3);
  });

  it("keeps handon and beef japuk separate", () => {
    const pork = parseOptionText("한돈 잡육 500g", 2);
    const beef = parseOptionText("소고기 잡육 1kg", 2);
    expect(qty(pork, "한돈 잡육")).toBe(2);
    expect(qty(beef, "소고기 잡육")).toBe(2);
    const totals = new DailyTotals();
    accumulate([...pork, ...beef], totals);
    expect(totals.handonJapuk500g).toBe(2);
    expect(totals.japukKg).toBe(2);
  });

  it("applies yukashimi gae and order qty", () => {
    const lines = parseOptionText("육사시미 500g 2개", 2);
    expect(qty(lines, "육사시미", 500)).toBe(4);
  });

  it("accumulates daily totals", () => {
    const totals = new DailyTotals();
    const lines = [
      ...parseOptionText("육회 300g x 2 + 육사시미 250g + 고추장소스", 2),
      ...parseOptionText("스지 2kg", 1),
      ...parseOptionText("소불고기 500g 3개", 1),
    ];
    accumulate(lines, totals);
    expect(totals.yukhoe[300]).toBe(4);
    expect(totals.yukashimi[250]).toBe(2);
    expect(totals.sujiKg).toBe(2);
    expect(totals.bulgogi500g).toBe(3);
  });
});
