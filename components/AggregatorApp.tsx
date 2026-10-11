"use client";

import { useEffect, useMemo, useState } from "react";
import {
  combineBatches,
  detectRound,
  meatGroupSubtotals,
  roundLabel,
} from "@/lib/aggregator/batches";
import type { DailyTotals } from "@/lib/aggregator/categories";
import {
  aggregateOrders,
  ExcelFormatError,
  readOrdersMatrix,
  type DetailRow,
} from "@/lib/aggregator/excel";
import {
  reportBytes,
  reportFileName,
} from "@/lib/aggregator/exportExcel";
import {
  dataUrlToBlob,
  pngFileName,
  renderSharePng,
} from "@/lib/aggregator/exportPng";
import { productionRows } from "@/lib/aggregator/summary";
import {
  buildProductionRows,
  saveProductionJob,
} from "@/lib/supabase/saveProduction";
import { DataTable } from "./DataTable";
import { FileDropMulti } from "./FileDropMulti";
import { ProductionTable, type QtyColumn } from "./ProductionTable";

function todayInputValue(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseDateInput(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type BatchResult = {
  batches: Record<number, DailyTotals>;
  details: Record<number, DetailRow[]>;
  errors: string[];
};

export function AggregatorApp() {
  const [files, setFiles] = useState<File[]>([]);
  const [reportDateStr, setReportDateStr] = useState(todayInputValue);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [ackUnmatched, setAckUnmatched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!files.length) {
        setResult(null);
        return;
      }
      setLoading(true);
      const batches: Record<number, DailyTotals> = {};
      const details: Record<number, DetailRow[]> = {};
      const errors: string[] = [];

      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const roundNo = detectRound(file.name, index + 1);
        try {
          const rows = await readOrdersMatrix(file);
          const { totals, detail } = aggregateOrders(rows);
          if (batches[roundNo]) {
            batches[roundNo].merge(totals);
            details[roundNo] = [...(details[roundNo] || []), ...detail];
          } else {
            batches[roundNo] = totals;
            details[roundNo] = detail;
          }
        } catch (err) {
          const message =
            err instanceof ExcelFormatError || err instanceof Error
              ? err.message
              : String(err);
          errors.push(`${file.name}: ${message}`);
        }
      }

      if (!cancelled) {
        setResult({ batches, details, errors });
        setActiveTab(0);
        setSaveNote("");
        setAckUnmatched(false);
        setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [files]);

  const reportDate = useMemo(
    () => parseDateInput(reportDateStr),
    [reportDateStr],
  );

  const rounds = useMemo(
    () =>
      result
        ? Object.keys(result.batches)
            .map(Number)
            .sort((a, b) => a - b)
        : [],
    [result],
  );

  const combined = useMemo(
    () =>
      result && Object.keys(result.batches).length
        ? combineBatches(result.batches, { onlyOrdered: true })
        : [],
    [result],
  );

  const allCombined = useMemo(
    () =>
      result && Object.keys(result.batches).length
        ? combineBatches(result.batches, { onlyOrdered: false })
        : [],
    [result],
  );

  const unmatched = useMemo(
    () =>
      result
        ? rounds.flatMap((roundNo) =>
            result.batches[roundNo].unmatched.map((text) => ({ roundNo, text })),
          )
        : [],
    [result, rounds],
  );
  const shareBlocked = unmatched.length > 0 && !ackUnmatched;

  const roundCols = useMemo(() => rounds.map(roundLabel), [rounds]);
  const pngCols = useMemo(
    () => ["품목", "용량", ...roundCols, "합계"],
    [roundCols],
  );
  const groupRows = useMemo(
    () => meatGroupSubtotals(allCombined, rounds),
    [allCombined, rounds],
  );

  const qtyColumns: QtyColumn[] = useMemo(
    () => [
      ...roundCols.map((col) => ({ key: col, label: col, unit: "개" })),
      { key: "합계", label: "합계", unit: "개", emphasize: "total" as const },
    ],
    [roundCols],
  );

  const kgQtyColumns: QtyColumn[] = useMemo(
    () => [
      ...roundCols.map((col) => ({ key: col, label: col, unit: "kg" })),
      { key: "합계", label: "합계", unit: "kg", emphasize: "total" as const },
    ],
    [roundCols],
  );

  const skuCount = combined.length;
  const packCount = combined.reduce((sum, row) => sum + Number(row.합계 || 0), 0);

  const pngPreview = useMemo(() => {
    if (!combined.length) return null;
    try {
      const qtyRows = combined.map((row) => {
        const next: Record<string, string | number> = {};
        for (const c of pngCols) next[c] = row[c] ?? "";
        return next;
      });
      return renderSharePng(qtyRows, groupRows, rounds, reportDate);
    } catch {
      return null;
    }
  }, [combined, pngCols, groupRows, rounds, reportDate]);

  const handleExcelDownload = () => {
    if (!result || !Object.keys(result.batches).length) return;
    const bytes = reportBytes(reportDate, result.batches);
    downloadBlob(
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      reportFileName(reportDate),
    );
  };

  const handlePngDownload = () => {
    if (!pngPreview || shareBlocked) return;
    downloadBlob(dataUrlToBlob(pngPreview), pngFileName(reportDate));
  };

  const handleDbSave = async () => {
    if (!result || !Object.keys(result.batches).length || saving || shareBlocked) {
      return;
    }
    setSaving(true);
    setSaveNote("");
    const unmatchedCount = unmatched.length;
    const packRows = combined.map((row) => {
      const next: Record<string, string | number> = {
        상품: String(row.상품),
        품목: String(row.품목),
        용량: String(row.용량),
        grams: Number(row.grams || 0),
        합계: Number(row.합계 || 0),
      };
      for (const col of roundCols) next[col] = Number(row[col] || 0);
      return next;
    });
    const saved = await saveProductionJob({
      reportDate,
      sourceFiles: files.map((f) => f.name),
      rounds,
      skuCount,
      packCount,
      unmatchedCount,
      status: result.errors.length ? "partial" : "ok",
      message: result.errors.length
        ? result.errors.join(" / ")
        : `${skuCount}종 · ${packCount}개 저장`,
      rows: buildProductionRows(packRows, groupRows, rounds),
    });
    setSaving(false);
    if (saved.ok) {
      setSaveNote(
        `${reportDate.getMonth() + 1}월 ${reportDate.getDate()}일 ${rounds.join("·")}차 집계를 저장했습니다.`,
      );
    } else {
      setSaveNote(`저장하지 못했습니다. ${saved.error || ""}`.trim());
    }
  };

  const qtyTableRows = combined.map((row) => ({
    품목: String(row.품목),
    용량: String(row.용량),
    ...Object.fromEntries(qtyColumns.map((c) => [c.key, Number(row[c.key] || 0)])),
  }));
  const kgTableRows = groupRows.map((row) => ({
    품목: String(row.품목),
    ...Object.fromEntries(kgQtyColumns.map((c) => [c.key, Number(row[c.key] || 0)])),
  }));
  const roundSums = rounds.map((roundNo) => {
    const col = roundLabel(roundNo);
    return {
      col,
      sum: combined.reduce((sum, row) => sum + Number(row[col] || 0), 0),
    };
  });

  return (
    <div className="workspace">
      <section className="card" aria-labelledby="upload-title">
        <div className="card-head">
          <div>
            <h2 id="upload-title">발송 엑셀 업로드</h2>
            <p className="hint">
              당일 01 · 02 · 03 파일을 한 번에 올려 주세요. xls, xlsx 모두
              가능합니다. (01→1차 · 02→2차 · 03→3차)
            </p>
          </div>
          <div className="date-field">
            <label htmlFor="report-date">생산일자</label>
            <input
              id="report-date"
              type="date"
              value={reportDateStr}
              onChange={(e) => setReportDateStr(e.target.value)}
            />
          </div>
        </div>
        <FileDropMulti files={files} onFiles={setFiles} />
        {files.length > 0 && (
          <div className="actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setFiles([])}
            >
              선택 초기화
            </button>
          </div>
        )}
      </section>

      {!files.length && (
        <div className="guide-grid">
          <div className="guide-card">
            <div className="guide-num">1</div>
            <h3>생산일자 확인</h3>
            <p>업로드 카드에서 생산일자가 오늘인지 확인합니다.</p>
          </div>
          <div className="guide-card">
            <div className="guide-num">2</div>
            <h3>발송 엑셀 업로드</h3>
            <p>파일명 끝 01·02·03이 1차·2차·3차로 자동 구분됩니다.</p>
          </div>
          <div className="guide-card">
            <div className="guide-num">3</div>
            <h3>엑셀·이미지 공유</h3>
            <p>집계표를 내려받아 카카오톡으로 보내면 됩니다.</p>
          </div>
        </div>
      )}

      <p className="caption" aria-live="polite">
        {loading ? "집계 중…" : ""}
      </p>

      {result?.errors?.length ? (
        <div className="errors" role="alert">
          {result.errors.map((msg) => (
            <p key={msg}>{msg}</p>
          ))}
        </div>
      ) : null}

      {unmatched.length > 0 && (
        <section className="alert" role="alert" aria-labelledby="unmatched-title">
          <h2 id="unmatched-title">인식하지 못한 주문 {unmatched.length}건</h2>
          <p>
            아래 주문은 수량에 들어가지 않았습니다. 옵션 문구가 바뀌었거나 새
            상품이면 품목 등록이 필요합니다.
          </p>
          <ul>
            {unmatched.map((item, idx) => (
              <li key={`${item.roundNo}-${idx}`}>
                <span className="round">{roundLabel(item.roundNo)}</span>
                {item.text}
              </li>
            ))}
          </ul>
          <label className="ack">
            <input
              type="checkbox"
              checked={ackUnmatched}
              onChange={(e) => setAckUnmatched(e.target.checked)}
            />
            빠진 주문을 확인했습니다. 이대로 이미지와 저장을 진행합니다.
          </label>
        </section>
      )}

      {result && Object.keys(result.batches).length > 0 && (
        <>
          <section className="sheet-section" aria-labelledby="today-title">
            <div className="sheet-head">
              <h2 id="today-title">오늘 만들어야 할 수량</h2>
              <p className="summary">
                <strong>{skuCount}종 · 총 {packCount}개</strong>
                {roundSums.length > 1 ? (
                  <span>
                    {roundSums.map((r) => `${r.col} ${r.sum}`).join(" · ")}
                  </span>
                ) : null}
              </p>
            </div>
            <ProductionTable
              caption="오늘 만들어야 할 수량"
              rows={qtyTableRows}
              nameKey="품목"
              subKey="용량"
              qtyColumns={qtyColumns}
            />
          </section>

          <section className="sheet-section" aria-labelledby="kg-title">
            <div className="sheet-head">
              <h3 id="kg-title">육회·육사시미 중량 합계</h3>
              <p className="caption">모든 용량을 kg으로 합친 값입니다.</p>
            </div>
            <ProductionTable
              caption="육회·육사시미 중량 합계"
              rows={kgTableRows}
              nameKey="품목"
              qtyColumns={kgQtyColumns}
            />
          </section>

          <section className="card" aria-labelledby="share-title">
            <h2 id="share-title">저장 · 공유</h2>
            <p className="hint" style={{ marginBottom: 12 }}>
              이미지를 받아 카카오톡으로 보내면 됩니다.
            </p>
            <div className="actions">
              <button
                type="button"
                className="primary-button"
                style={{ marginTop: 0 }}
                onClick={handlePngDownload}
                disabled={!pngPreview || shareBlocked}
              >
                카카오 공유용 이미지
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={handleExcelDownload}
              >
                엑셀 다운로드
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => void handleDbSave()}
                disabled={saving || shareBlocked}
              >
                {saving ? "저장 중…" : "오늘 집계 DB 저장"}
              </button>
            </div>
            <p className="caption" aria-live="polite" style={{ marginTop: 8 }}>
              {shareBlocked
                ? "인식하지 못한 주문을 먼저 확인해 주세요."
                : saveNote}
            </p>
            {pngPreview && (
              <details open style={{ marginTop: 12 }}>
                <summary>카카오 공유 이미지 미리보기</summary>
                <div className="preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pngPreview} alt="카카오 공유용 집계 이미지" />
                </div>
              </details>
            )}
          </section>

          <section aria-labelledby="detail-title">
            <h2 id="detail-title" className="section-title">
              차수 상세
            </h2>

            <div className="tabs" role="tablist" aria-label="차수 상세">
              {rounds.map((roundNo, idx) => (
                <button
                  key={roundNo}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === idx}
                  className={activeTab === idx ? "is-active" : undefined}
                  onClick={() => setActiveTab(idx)}
                >
                  {roundLabel(roundNo)} 상세
                </button>
              ))}
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === rounds.length}
                className={activeTab === rounds.length ? "is-active" : undefined}
                onClick={() => setActiveTab(rounds.length)}
              >
                전체 용량표
              </button>
            </div>

            {activeTab < rounds.length &&
              (() => {
                const roundNo = rounds[activeTab];
                const totals = result.batches[roundNo];
                const rows = productionRows(totals, { onlyOrdered: true }).map(
                  (r) => ({
                    품목: r.품목,
                    용량: r.용량,
                    합계: r["총 개수"],
                  }),
                );
                const detail = result.details[roundNo] || [];
                return (
                  <div className="workspace" role="tabpanel">
                    <ProductionTable
                      caption={`${roundLabel(roundNo)} 수량`}
                      rows={rows}
                      nameKey="품목"
                      subKey="용량"
                      qtyColumns={[
                        {
                          key: "합계",
                          label: "총 개수",
                          unit: "개",
                          emphasize: "total",
                        },
                      ]}
                    />
                    {detail.length > 0 && (
                      <details>
                        <summary>주문별 해석 내역</summary>
                        <DataTable
                          columns={[
                            "원문",
                            "품목",
                            "용량(g)",
                            "묶음수량",
                            "주문수량",
                            "최종수량",
                            "구분",
                            "비고",
                          ]}
                          rows={detail.map((d) => ({
                            ...d,
                            "용량(g)": d["용량(g)"] ?? "",
                          }))}
                          searchKeys={["원문", "품목"]}
                        />
                      </details>
                    )}
                  </div>
                );
              })()}

            {activeTab === rounds.length && (
              <div className="workspace" role="tabpanel">
                <ProductionTable
                  caption="전체 용량표"
                  rows={allCombined.map((row) => ({
                    품목: String(row.품목),
                    용량: String(row.용량),
                    ...Object.fromEntries(
                      qtyColumns.map((c) => [c.key, Number(row[c.key] || 0)]),
                    ),
                  }))}
                  nameKey="품목"
                  subKey="용량"
                  qtyColumns={qtyColumns}
                />
              </div>
            )}
          </section>
        </>
      )}

      <p className="note">
        엑셀 원본은 이 브라우저에서만 읽습니다. 저장할 때는 집계 결과만
        보냅니다.
      </p>
    </div>
  );
}
