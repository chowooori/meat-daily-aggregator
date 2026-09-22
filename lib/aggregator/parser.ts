/** 주문선택사항 문자열 파싱 */

import {
  DailyTotals,
  findProduct,
  isExcluded,
  type ProductSpec,
} from "./categories";

const WEIGHT_RE = /(\d+(?:\.\d+)?)\s*(kg|g)/i;
const MULT_X_RE = /[xX×*]\s*(\d+)/;
const MULT_GAE_RE = /(\d+)\s*개/;
const PLUS_SPLIT_RE = /\s*[+＋]\s*/;

export type ParseMode = "pack_g" | "unit_g" | "extra_pack" | "unmatched";

export interface ParsedLine {
  original: string;
  product: string;
  grams: number | null;
  innerQty: number;
  orderQty: number;
  finalQty: number;
  mode: ParseMode;
  note: string;
}

function toGrams(num: string, unit: string): number {
  const value = Number(num);
  if (unit.toLowerCase() === "kg") return Math.round(value * 1000);
  return Math.round(value);
}

function innerMultiplier(text: string): number {
  const matchX = MULT_X_RE.exec(text);
  if (matchX?.[1]) return Math.max(1, Number(matchX[1]));
  const matchGae = MULT_GAE_RE.exec(text);
  if (matchGae?.[1]) return Math.max(1, Number(matchGae[1]));
  return 1;
}

function nearestPack(grams: number, sizes: readonly number[]): number | null {
  if (sizes.includes(grams)) return grams;
  for (const size of [...sizes].sort((a, b) => b - a)) {
    if (grams % size === 0) return size;
  }
  return null;
}

export function parsePiece(piece: string, orderQty: number): ParsedLine[] {
  const text = String(piece).trim();
  if (!text) return [];

  const spec: ProductSpec | null = findProduct(text);
  if (spec === null || (isExcluded(text) && WEIGHT_RE.exec(text) === null)) {
    if (spec === null && !isExcluded(text) && text) {
      return [
        {
          original: text,
          product: "",
          grams: null,
          innerQty: 1,
          orderQty,
          finalQty: 0,
          mode: "unmatched",
          note: "미인식 품목",
        },
      ];
    }
    return [];
  }

  const weightMatch = WEIGHT_RE.exec(text);
  const grams = weightMatch
    ? toGrams(weightMatch[1], weightMatch[2])
    : null;
  const inner = innerMultiplier(text);

  if (spec.mode === "pack_g") {
    if (grams === null) {
      return [
        {
          original: text,
          product: spec.canonical,
          grams: null,
          innerQty: inner,
          orderQty,
          finalQty: 0,
          mode: "unmatched",
          note: "용량 없음",
        },
      ];
    }

    const packSize = nearestPack(grams, spec.packSizes);
    if (packSize === null) {
      const packs = inner * orderQty;
      return [
        {
          original: text,
          product: spec.canonical,
          grams,
          innerQty: inner,
          orderQty,
          finalQty: packs,
          mode: "extra_pack",
          note: "정의되지 않은 용량",
        },
      ];
    }

    const packCount = (grams / packSize) * inner * orderQty;
    return [
      {
        original: text,
        product: spec.canonical,
        grams: packSize,
        innerQty: inner,
        orderQty,
        finalQty: packCount,
        mode: "pack_g",
        note: "",
      },
    ];
  }

  const unitG = spec.unitG;
  let units: number;
  let note = "";
  if (grams === null) {
    units = inner * orderQty;
    note = `용량 없음 → ${unitG}g 1단위로 가정`;
  } else {
    units = (grams / unitG) * inner * orderQty;
    if (Math.abs(units - Math.round(units)) > 1e-9) {
      note = "단위가 정수로 떨어지지 않음";
    }
  }

  return [
    {
      original: text,
      product: spec.canonical,
      grams: grams ?? unitG,
      innerQty: inner,
      orderQty,
      finalQty: units,
      mode: "unit_g",
      note,
    },
  ];
}

export function parseOptionText(
  optionText: unknown,
  orderQty: number,
): ParsedLine[] {
  if (optionText === null || optionText === undefined) return [];
  if (typeof optionText === "number" && Number.isNaN(optionText)) return [];
  const text = String(optionText).trim();
  if (!text || text.toLowerCase() === "nan") return [];
  let qty = Number(orderQty) || 0;
  if (qty <= 0) qty = 1;
  const pieces = text.split(PLUS_SPLIT_RE);
  const result: ParsedLine[] = [];
  for (const piece of pieces) {
    result.push(...parsePiece(piece, qty));
  }
  return result;
}

export function accumulate(lines: ParsedLine[], totals: DailyTotals): void {
  for (const line of lines) {
    if (line.mode === "unmatched") {
      totals.unmatched.push(line.original);
      continue;
    }
    if (line.mode === "pack_g" || line.mode === "extra_pack") {
      totals.addPack(line.product, Math.trunc(line.grams || 0), Math.trunc(line.finalQty));
    } else if (line.mode === "unit_g") {
      totals.addUnits(line.product, line.finalQty);
    }
  }
}
