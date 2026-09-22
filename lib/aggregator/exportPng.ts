/** 카카오 공유용 수량표 PNG (Canvas) */

import { roundLabel } from "./batches";

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "0";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toFixed(2))).replace(/\.?0+$/, "");
  }
  return String(value);
}

function ymdKorean(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function renderSharePng(
  qtyRows: Array<Record<string, string | number>>,
  kgRows: Array<Record<string, string | number>>,
  rounds: number[],
  reportDate: Date,
): string {
  const roundCols = rounds.map(roundLabel);
  const headers = ["상품", "용량", ...roundCols, "합계"];
  const colW = [280, 120, ...roundCols.map(() => 110), 130];
  const width = colW.reduce((a, b) => a + b, 0) + 72;
  const rowH = 52;
  const headerH = 54;
  const titleH = 128;
  const kgTitleH = 56;
  const footerH = 48;
  const tableRows = Math.max(qtyRows.length, 1);
  const kgRowsN = Math.max(kgRows.length, 1);
  const height =
    titleH +
    headerH +
    tableRows * rowH +
    28 +
    kgTitleH +
    headerH +
    kgRowsN * rowH +
    footerH;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas를 사용할 수 없습니다.");

  const NAVY = "#1f4e79";
  const GOLD = "#fff2cc";
  const GREEN = "#e2efda";
  const WHITE = "#ffffff";
  const GRAY = "#f7f7f7";
  const TEXT = "#212529";
  const MUTED = "#5a6268";

  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, width, 96);
  ctx.fillStyle = WHITE;
  ctx.font = "bold 36px Malgun Gothic, Apple SD Gothic Neo, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("오늘 만들어야 할 수량", 36, 36);
  ctx.fillStyle = "#d2e0ed";
  ctx.font = "18px Malgun Gothic, Apple SD Gothic Neo, sans-serif";
  ctx.fillText(
    `${ymdKorean(reportDate)}   ${roundCols.join(" · ")}   카카오 공유용`,
    36,
    72,
  );

  const drawTable = (
    originY: number,
    cols: string[],
    rows: Array<Record<string, string | number>>,
    keyMap: string[],
  ): number => {
    let x = 36;
    let y = originY;
    const xs = [x];
    for (let i = 0; i < cols.length; i++) {
      xs.push(xs[xs.length - 1] + (colW[i] || 110));
    }
    for (let i = 0; i < cols.length; i++) {
      ctx.fillStyle = NAVY;
      ctx.fillRect(xs[i], y, xs[i + 1] - xs[i], headerH);
      ctx.fillStyle = WHITE;
      ctx.font = "bold 18px Malgun Gothic, Apple SD Gothic Neo, sans-serif";
      ctx.fillText(cols[i], xs[i] + 16, y + headerH / 2);
    }
    y += headerH;
    if (!rows.length) {
      ctx.fillStyle = GRAY;
      ctx.fillRect(xs[0], y, xs[xs.length - 1] - xs[0], rowH);
      ctx.fillStyle = MUTED;
      ctx.font = "20px Malgun Gothic, Apple SD Gothic Neo, sans-serif";
      ctx.fillText("집계된 수량이 없습니다", xs[0] + 16, y + rowH / 2);
      return y + rowH;
    }
    for (let ridx = 0; ridx < rows.length; ridx++) {
      const row = rows[ridx];
      ctx.fillStyle = ridx % 2 === 0 ? GREEN : WHITE;
      ctx.fillRect(xs[0], y, xs[xs.length - 1] - xs[0], rowH);
      ctx.fillStyle = GOLD;
      ctx.fillRect(xs[xs.length - 2], y, xs[xs.length - 1] - xs[xs.length - 2], rowH);
      for (let i = 0; i < keyMap.length; i++) {
        const key = keyMap[i];
        const text =
          i === 0 ? String(row[key] ?? "") : fmt(row[key]);
        ctx.fillStyle = TEXT;
        ctx.font =
          key === "합계"
            ? "bold 22px Malgun Gothic, Apple SD Gothic Neo, sans-serif"
            : "20px Malgun Gothic, Apple SD Gothic Neo, sans-serif";
        ctx.fillText(text, xs[i] + 16, y + rowH / 2);
      }
      y += rowH;
    }
    ctx.strokeStyle = "#b4bac0";
    ctx.lineWidth = 1;
    ctx.strokeRect(xs[0], originY, xs[xs.length - 1] - xs[0], y - originY);
    return y;
  };

  let y = drawTable(titleH, headers, qtyRows, [
    "상품",
    "용량",
    ...roundCols,
    "합계",
  ]);
  y += 20;
  ctx.fillStyle = "#2e86ab";
  ctx.fillRect(36, y, width - 72, kgTitleH - 8);
  ctx.fillStyle = WHITE;
  ctx.font = "bold 18px Malgun Gothic, Apple SD Gothic Neo, sans-serif";
  ctx.fillText("육회 · 육사시미 전용량 중량 (kg)", 52, y + (kgTitleH - 8) / 2);
  y += kgTitleH;
  y = drawTable(
    y,
    ["품목", "단위", ...roundCols, "합계"],
    kgRows,
    ["품목", "단위", ...roundCols, "합계"],
  );

  ctx.fillStyle = MUTED;
  ctx.font = "18px Malgun Gothic, Apple SD Gothic Neo, sans-serif";
  ctx.fillText("카카오톡에 이 이미지를 전송하세요", 36, height - footerH / 2);

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
