/** 카카오 공유용 수량표 PNG (Canvas). 휴대폰 세로 화면에서 읽히도록 720px 폭, 2배 해상도로 그립니다. */

import { roundLabel } from "./batches";

const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const SCALE = 2;
const WIDTH = 720;
const PAD = 24;

const NAVY = "#1f4e79";
const NAVY_SUB = "#d2e0ed";
const GOLD = "#fff2cc";
const GREEN = "#eef6e9";
const WHITE = "#ffffff";
const TEXT = "#1b1f23";
const MUTED = "#5a6268";
const ZERO = "#a3aab1";
const GROUP_LINE = "#8fa6bb";
const KG_BAND = "#2e86ab";
const CAUTION_BAND = "#b4532a";
const CAUTION_BG = "#fff4e5";

function fmt(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(2)));
}

function ymdKorean(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** 칸 폭에 맞을 때까지 글자를 줄이고, 그래도 넘치면 말줄임표를 붙입니다. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: string,
  size: number,
  minSize: number,
): { text: string; font: string } {
  for (let s = size; s >= minSize; s -= 1) {
    const font = `${weight} ${s}px ${FONT}`;
    ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) return { text, font };
  }
  const font = `${weight} ${minSize}px ${FONT}`;
  ctx.font = font;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return { text: `${cut}…`, font };
}

/** 폭을 넘는 문장을 글자 단위로 줄바꿈합니다(한글은 띄어쓰기가 적어 글자 단위가 안전합니다). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const ch of text) {
    if (ctx.measureText(current + ch).width > maxWidth && current) {
      lines.push(current);
      current = ch === " " ? "" : `  ${ch}`;
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function renderSharePng(
  qtyRows: Array<Record<string, string | number>>,
  kgRows: Array<Record<string, string | number>>,
  rounds: number[],
  reportDate: Date,
  createdAt: Date = new Date(),
  /** 표 아래에 작게 넣는 한 줄 안내(예: 합계에 환불이 반영됐다는 문구). */
  note = "",
  /** 맨 아래 "주의 사항" 칸에 넣을 확인 업체 안내 문구. */
  cautions: string[] = [],
): string {
  const roundCols = rounds.map(roundLabel);
  const numW = roundCols.length > 2 ? 86 : 100;
  const totalW = 118;
  const nameW = WIDTH - PAD * 2 - numW * roundCols.length - totalW;

  const bandH = 104;
  const headH = 48;
  const rowH = 64;
  const gap = 28;
  const kgBandH = 48;
  const footerH = 60;
  const noteH = note ? 36 : 0;
  const cautionLineH = 30;
  const cautionPad = 16;
  const qN = Math.max(qtyRows.length, 1);
  const kN = Math.max(kgRows.length, 1);
  // 주의 사항은 줄바꿈 수를 알아야 높이가 정해지므로 먼저 측정용 캔버스로 나눕니다.
  const measure = document.createElement("canvas").getContext("2d");
  const cautionLines: string[] = [];
  if (measure && cautions.length) {
    measure.font = `bold 22px ${FONT}`;
    for (const text of cautions) cautionLines.push(...wrapText(measure, `• ${text}`, WIDTH - PAD * 2 - 28));
  }
  const cautionH = cautionLines.length
    ? gap + 44 + cautionLines.length * cautionLineH + cautionPad * 2
    : 0;
  const height =
    bandH + 20 + headH + qN * rowH + gap + kgBandH + headH + kN * rowH + cautionH + noteH + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas를 사용할 수 없습니다.");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "middle";

  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, WIDTH, height);

  const packTotal = qtyRows.reduce((sum, row) => sum + Number(row["합계"] || 0), 0);
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, WIDTH, bandH);
  ctx.fillStyle = WHITE;
  ctx.textAlign = "left";
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillText("오늘 만들어야 할 수량", PAD, 40);
  ctx.fillStyle = NAVY_SUB;
  ctx.font = `20px ${FONT}`;
  ctx.fillText(
    `${ymdKorean(reportDate)} · ${roundCols.join("·")} · ${qtyRows.length}종 ${fmt(packTotal)}개`,
    PAD,
    78,
  );

  const xs: number[] = [PAD, PAD + nameW];
  for (let i = 0; i < roundCols.length; i++) xs.push(xs[xs.length - 1] + numW);
  xs.push(xs[xs.length - 1] + totalW);
  const right = xs[xs.length - 1];

  const drawTable = (
    originY: number,
    firstHeader: string,
    rows: Array<Record<string, string | number>>,
    nameOf: (row: Record<string, string | number>) => { name: string; sub: string },
  ): number => {
    let y = originY;
    ctx.fillStyle = NAVY;
    ctx.fillRect(xs[0], y, right - xs[0], headH);
    ctx.fillStyle = WHITE;
    ctx.font = `bold 20px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(firstHeader, xs[0] + 14, y + headH / 2);
    ctx.textAlign = "right";
    roundCols.forEach((col, i) => ctx.fillText(col, xs[i + 2] - 14, y + headH / 2));
    ctx.fillText("합계", right - 14, y + headH / 2);
    y += headH;

    if (!rows.length) {
      ctx.fillStyle = MUTED;
      ctx.textAlign = "left";
      ctx.font = `22px ${FONT}`;
      ctx.fillText("집계된 수량이 없습니다", xs[0] + 14, y + rowH / 2);
      return y + rowH;
    }

    let prevName = "";
    rows.forEach((row, ridx) => {
      const { name, sub } = nameOf(row);
      ctx.fillStyle = ridx % 2 === 0 ? GREEN : WHITE;
      ctx.fillRect(xs[0], y, right - xs[0], rowH);
      ctx.fillStyle = GOLD;
      ctx.fillRect(xs[xs.length - 2], y, totalW, rowH);
      if (ridx > 0 && name !== prevName) {
        ctx.fillStyle = GROUP_LINE;
        ctx.fillRect(xs[0], y, right - xs[0], 2);
      }
      prevName = name;

      const label = sub ? `${name}  ${sub}` : name;
      const fitted = fitText(ctx, label, nameW - 20, "bold", 26, 18);
      ctx.fillStyle = TEXT;
      ctx.textAlign = "left";
      ctx.font = fitted.font;
      ctx.fillText(fitted.text, xs[0] + 14, y + rowH / 2);

      ctx.textAlign = "right";
      roundCols.forEach((col, i) => {
        const amount = Number(row[col] || 0);
        ctx.fillStyle = amount ? TEXT : ZERO;
        ctx.font = `28px ${FONT}`;
        ctx.fillText(amount ? fmt(amount) : "–", xs[i + 2] - 14, y + rowH / 2);
      });
      const total = Number(row["합계"] || 0);
      ctx.fillStyle = total ? TEXT : ZERO;
      ctx.font = `bold 32px ${FONT}`;
      ctx.fillText(total ? fmt(total) : "–", right - 14, y + rowH / 2);
      y += rowH;
    });

    ctx.strokeStyle = "#b4bac0";
    ctx.lineWidth = 1;
    ctx.strokeRect(xs[0], originY, right - xs[0], y - originY);
    return y;
  };

  let y = drawTable(bandH + 20, "품목 · 용량", qtyRows, (row) => ({
    name: String(row["품목"] ?? ""),
    sub: String(row["용량"] ?? ""),
  }));

  y += gap;
  ctx.fillStyle = KG_BAND;
  ctx.fillRect(xs[0], y, right - xs[0], kgBandH - 8);
  ctx.fillStyle = WHITE;
  ctx.textAlign = "left";
  ctx.font = `bold 20px ${FONT}`;
  ctx.fillText("육회 · 육사시미 중량 합계 (kg)", xs[0] + 14, y + (kgBandH - 8) / 2);
  y += kgBandH;
  drawTable(y, "품목", kgRows, (row) => ({
    name: String(row["품목"] ?? ""),
    sub: "",
  }));

  if (cautionLines.length) {
    let cy = height - footerH - noteH - cautionH + gap;
    ctx.fillStyle = CAUTION_BAND;
    ctx.fillRect(PAD, cy, WIDTH - PAD * 2, 44);
    ctx.fillStyle = WHITE;
    ctx.textAlign = "left";
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText("주의 사항", PAD + 14, cy + 22);
    cy += 44;
    const boxH = cautionLines.length * cautionLineH + cautionPad * 2;
    ctx.fillStyle = CAUTION_BG;
    ctx.fillRect(PAD, cy, WIDTH - PAD * 2, boxH);
    ctx.fillStyle = TEXT;
    ctx.font = `bold 22px ${FONT}`;
    cautionLines.forEach((line, i) => {
      ctx.fillText(line, PAD + 14, cy + cautionPad + cautionLineH * i + cautionLineH / 2);
    });
  }

  ctx.fillStyle = MUTED;
  ctx.font = `18px ${FONT}`;
  ctx.textAlign = "left";
  if (note) ctx.fillText(note, PAD, height - footerH - noteH / 2);
  ctx.fillText(`${hhmm(createdAt)} 작성`, PAD, height - footerH / 2);
  ctx.textAlign = "right";
  ctx.fillText("일일 생산 집계", right, height - footerH / 2);

  return canvas.toDataURL("image/png");
}

export function pngFileName(reportDate: Date): string {
  const y = reportDate.getFullYear();
  const m = String(reportDate.getMonth() + 1).padStart(2, "0");
  const d = String(reportDate.getDate()).padStart(2, "0");
  return `카카오공유_${y}${m}${d}.png`;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(header)?.[1] || "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
