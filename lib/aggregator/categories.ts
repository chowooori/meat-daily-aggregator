/** 품목 카테고리와 집계 단위 정의 */

export const EXCLUDE_KEYWORDS = [
  "소스",
  "고추장",
  "참기름",
  "와사비",
  "겨자",
  "초장",
  "쌈장",
  "양념",
  "기름",
  "아이스팩",
  "아이스 팩",
  "드라이아이스",
  "포장재",
  "포장",
  "계란",
  "달걀",
  "소금",
  "후추",
  "마늘",
  "대파",
  "김가루",
  "깨",
  "참깨",
] as const;

export const YUKASHIMI_SIZES = [200, 250, 300, 400, 500, 600] as const;
export const YUKHOE_SIZES = [200, 230, 300, 400, 600, 1000] as const;

export type ProductMode = "pack_g" | "unit_g";

export interface ProductSpec {
  canonical: string;
  aliases: readonly string[];
  mode: ProductMode;
  packSizes: readonly number[];
  unitG: number;
}

export const PRODUCTS: readonly ProductSpec[] = [
  {
    canonical: "육사시미",
    aliases: ["육사시미", "육 사시미"],
    mode: "pack_g",
    packSizes: YUKASHIMI_SIZES,
    unitG: 1000,
  },
  {
    canonical: "육회",
    aliases: ["육회"],
    mode: "pack_g",
    packSizes: YUKHOE_SIZES,
    unitG: 1000,
  },
  {
    canonical: "소불고기",
    aliases: ["소불고기"],
    mode: "unit_g",
    packSizes: [],
    unitG: 500,
  },
  {
    canonical: "한돈 잡육",
    aliases: ["한돈 잡육", "한돈잡육"],
    mode: "unit_g",
    packSizes: [],
    unitG: 500,
  },
  {
    canonical: "소고기 잡육",
    aliases: ["소고기 잡육", "소고기잡육"],
    mode: "unit_g",
    packSizes: [],
    unitG: 1000,
  },
  {
    canonical: "소갈비",
    aliases: ["소갈비", "갈비"],
    mode: "unit_g",
    packSizes: [],
    unitG: 1000,
  },
  {
    canonical: "배필",
    aliases: ["배필", "배 필"],
    mode: "unit_g",
    packSizes: [],
    unitG: 1000,
  },
  {
    canonical: "사태",
    aliases: ["사태"],
    mode: "unit_g",
    packSizes: [],
    unitG: 1000,
  },
  {
    canonical: "스지",
    aliases: ["스지"],
    mode: "unit_g",
    packSizes: [],
    unitG: 1000,
  },
];

const ALIAS_INDEX: Array<[string, ProductSpec]> = [];
for (const spec of PRODUCTS) {
  for (const alias of spec.aliases) {
    ALIAS_INDEX.push([alias.replace(/\s+/g, "").toLowerCase(), spec]);
  }
}
ALIAS_INDEX.sort((a, b) => b[0].length - a[0].length);

export function findProduct(text: string): ProductSpec | null {
  const compact = text.replace(/\s+/g, "").toLowerCase();
  for (const [alias, spec] of ALIAS_INDEX) {
    if (compact.includes(alias)) return spec;
  }
  return null;
}

export function isExcluded(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  return EXCLUDE_KEYWORDS.some((keyword) =>
    compact.includes(keyword.replace(/\s+/g, "")),
  );
}

export type ExtraPack = [string, number, number];

export class DailyTotals {
  yukashimi: Record<number, number> = Object.fromEntries(
    YUKASHIMI_SIZES.map((s) => [s, 0]),
  );
  yukhoe: Record<number, number> = Object.fromEntries(
    YUKHOE_SIZES.map((s) => [s, 0]),
  );
  baepilKg = 0;
  sataeKg = 0;
  galbiKg = 0;
  japukKg = 0;
  handonJapuk500g = 0;
  bulgogi500g = 0;
  sujiKg = 0;
  extraPacks: ExtraPack[] = [];
  skipped: string[] = [];
  unmatched: string[] = [];

  addPack(name: string, grams: number, packs: number): void {
    if (packs <= 0) return;
    if (name === "육사시미" && grams in this.yukashimi) {
      this.yukashimi[grams] += packs;
    } else if (name === "육회" && grams in this.yukhoe) {
      this.yukhoe[grams] += packs;
    } else {
      this.extraPacks.push([name, grams, packs]);
    }
  }

  addUnits(name: string, units: number): void {
    if (units <= 0) return;
    const mapping: Record<string, keyof DailyTotals> = {
      배필: "baepilKg",
      사태: "sataeKg",
      소갈비: "galbiKg",
      "소고기 잡육": "japukKg",
      "한돈 잡육": "handonJapuk500g",
      소불고기: "bulgogi500g",
      스지: "sujiKg",
    };
    const attr = mapping[name];
    if (attr) {
      (this[attr] as number) += units;
    } else {
      this.unmatched.push(`${name} ${units}`);
    }
  }

  merge(other: DailyTotals): void {
    for (const [grams, qty] of Object.entries(other.yukashimi)) {
      const g = Number(grams);
      this.yukashimi[g] = (this.yukashimi[g] || 0) + qty;
    }
    for (const [grams, qty] of Object.entries(other.yukhoe)) {
      const g = Number(grams);
      this.yukhoe[g] = (this.yukhoe[g] || 0) + qty;
    }
    this.baepilKg += other.baepilKg;
    this.sataeKg += other.sataeKg;
    this.galbiKg += other.galbiKg;
    this.japukKg += other.japukKg;
    this.handonJapuk500g += other.handonJapuk500g;
    this.bulgogi500g += other.bulgogi500g;
    this.sujiKg += other.sujiKg;
    this.extraPacks.push(...other.extraPacks);
    this.skipped.push(...other.skipped);
    this.unmatched.push(...other.unmatched);
  }
}
