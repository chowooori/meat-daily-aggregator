import { describe, expect, it } from "vitest";
import { MANUAL_ROUND } from "@/lib/aggregator/batches";
import { aggregateOrders } from "@/lib/aggregator/excel";
import {
  buildWatchRows,
  cleanWatchBusinesses,
  matchWatchBusiness,
  watchNotices,
} from "@/lib/aggregator/watchBusinesses";

describe("watch businesses", () => {
  it("finds the business name inside an address, ignoring spaces", () => {
    expect(matchWatchBusiness(["충청북도 충주시 예성로 42 (지현동) 육회챱챱", ""])?.name).toBe("육회챱챱");
    expect(matchWatchBusiness(["충주시 예성로 42 육회 챱챱"])?.name).toBe("육회챱챱");
    expect(matchWatchBusiness(["서울 어딘가 101호", "홍길동"])).toBeNull();
  });

  it("pulls the watched orders out of an uploaded sheet without keeping the address", () => {
    const rows = [
      { 수령자명: "김○○", 배송지주소: "충청북도 충주시 예성로 42 (지현동) 육회챱챱", 주문선택사항: "육회 1kg", 주문수량: 4 },
      { 수령자명: "이○○", 배송지주소: "서울시 어딘가", 주문선택사항: "육회 1kg", 주문수량: 2 },
      { 수령자명: "육회챱챱", 배송지주소: "다른 주소", 주문선택사항: "육회 300g x 2 + 소스", 주문수량: 1 },
    ];
    const { watch, totals } = aggregateOrders(rows);
    expect(totals.yukhoe[1000]).toBe(6);
    expect(watch).toEqual([
      { business: "육회챱챱", item: "육회 300g", qty: 2 },
      { business: "육회챱챱", item: "육회 1kg", qty: 4 },
    ]);
    expect(JSON.stringify(watch)).not.toContain("예성로");
  });

  it("writes one notice per business with rounds and the requirement", () => {
    const notices = watchNotices([
      { business: "육회챱챱", item: "육회 1kg", qty: 4, round: 1 },
      { business: "육회챱챱", item: "육회 300g", qty: 2, round: 2 },
      { business: "육회챱챱", item: "육회 1kg", qty: 1, round: MANUAL_ROUND },
    ]);
    expect(notices).toEqual([
      "육회챱챱: 육회 1kg 4개(1차), 육회 300g 2개(2차), 육회 1kg 1개(식당) 주문 있어요 · 200g 소분포장",
    ]);
    expect(watchNotices([])).toEqual([]);
  });

  it("saves watched orders as their own rows with no address", () => {
    const rows = buildWatchRows(
      [
        { business: "육회챱챱", item: "육회 1kg", qty: 3, round: 1 },
        { business: "육회챱챱", item: "육회 1kg", qty: 1, round: 1 },
      ],
      10,
    );
    expect(rows).toEqual([
      expect.objectContaining({ row_no: 10, kind: "watch", product: "육회챱챱", category: "육회 1kg", qty_total: 4 }),
    ]);
  });

  it("uses the list passed in and cleans names before saving", () => {
    const list = cleanWatchBusinesses([
      { name: "  새식당 ", note: " 두껍게 " },
      { name: "새 식당", note: "중복" },
      { name: "", note: "이름 없음" },
      "잘못된 값",
    ]);
    expect(list).toEqual([{ name: "새식당", note: "두껍게" }]);
    expect(matchWatchBusiness(["서울 새식당 본점"], list)?.name).toBe("새식당");
    expect(matchWatchBusiness(["충주 육회챱챱"], list)).toBeNull();
    expect(watchNotices([{ business: "새식당", item: "사태 1kg", qty: 2, round: 1 }], list)).toEqual([
      "새식당: 사태 1kg 2개(1차) 주문 있어요 · 두껍게",
    ]);
  });
});
