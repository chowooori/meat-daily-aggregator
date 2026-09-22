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
  const [pngPreview, setPngPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!files.length) {
        setResult(null);
        setPngPreview(null);
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

  const roundCols = useMemo(() => rounds.map(roundLabel), [rounds]);
  const displayCols = useMemo(
    () => ["상품", "용량", ...roundCols, "합계"],
    [roundCols],
  );
  const groupCols = useMemo(
    () => ["품목", "단위", ...roundCols, "합계"],
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

  useEffect(() => {
    if (!combined.length) {
      setPngPreview(null);
      return;
    }
    try {
      const qtyRows = combined.map((row) => {
        const next: Record<string, string | number> = {};
        for (const c of displayCols) next[c] = row[c] ?? "";
        return next;
      });
      const dataUrl = renderSharePng(qtyRows, groupRows, rounds, reportDate);
      setPngPreview(dataUrl);
    } catch {
      setPngPreview(null);
    }
  }, [combined, displayCols, groupRows, rounds, reportDate]);

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
    if (!pngPreview) return;
    downloadBlob(dataUrlToBlob(pngPreview), pngFileName(reportDate));
  };

  return (
    <div className="workspace">
      <section className="card">
        <div className="card-head">
          <div>
            <h3>발송 엑셀 업로드</h3>
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
            <h4>생산일자 확인</h4>
            <p>업로드 카드에서 생산일자가 오늘인지 확인합니다.</p>
          </div>
          <div className="guide-card">
            <div className="guide-num">2</div>
            <h4>발송 엑셀 업로드</h4>
            <p>파일명 끝 01·02·03이 1차·2차·3차로 자동 구분됩니다.</p>
          </div>
          <div className="guide-card">
            <div className="guide-num">3</div>
            <h4>엑셀·이미지 공유</h4>
            <p>집계표를 내려받아 카카오톡으로 보내면 됩니다.</p>
          </div>
        </div>
      )}

      {loading && <p className="caption">집계 중…</p>}

      {result?.errors?.length ? (
        <div className="errors">
          {result.errors.map((msg) => (
            <p key={msg}>{msg}</p>
          ))}
        </div>
      ) : null}

      {result && Object.keys(result.batches).length > 0 && (
        <>
          <div>
            <p className="section-label">Today</p>
            <h2 style={{ margin: "0 0 6px", fontSize: "1.25rem" }}>
              오늘 만들어야 할 수량
            </h2>
            <p className="caption" style={{ marginBottom: 12 }}>
              차수 파일의 주문을 용량별로 합친 개수입니다. 합계는 당일 전체
              제조량입니다.
            </p>
          </div>

          <div className="metrics">
            <div className="metric">
              <div className="label">제조할 상품(용량)</div>
              <div className="value">
                {skuCount}
                <span>종</span>
              </div>
            </div>
            <div className="metric">
              <div className="label">당일 합계</div>
              <div className="value">
                {packCount}
                <span>개</span>
              </div>
            </div>
            {rounds.map((roundNo) => {
              const col = roundLabel(roundNo);
              const roundSum = combined.reduce(
                (sum, row) => sum + Number(row[col] || 0),
                0,
              );
              return (
                <div className="metric" key={roundNo}>
                  <div className="label">{col}</div>
                  <div className="value">
                    {roundSum}
                    <span>개</span>
                  </div>
                </div>
              );
            })}
          </div>

          <ProductionTable
            rows={combined.map((row) => ({
              상품: String(row.품목 || row.상품),
              용량: String(row.용량),
              구분: String(row.품목),
              ...Object.fromEntries(
                qtyColumns.map((c) => [c.key, Number(row[c.key] || 0)]),
              ),
            }))}
            nameKey="상품"
            subKey="용량"
            descKey="구분"
            qtyColumns={qtyColumns}
            totalKey="합계"
            primaryActionLabel="엑셀 다운로드"
            onPrimaryAction={handleExcelDownload}
          />

          <div>
            <h2 style={{ margin: "8px 0 6px", fontSize: "1.15rem" }}>
              육회·육사시미 전용량 중량
            </h2>
            <p className="caption" style={{ marginBottom: 12 }}>
              모든 용량을 kg으로 합친 값입니다.
            </p>
          </div>

          <ProductionTable
            rows={groupRows.map((row) => ({
              상품: String(row.품목),
              용량: String(row.단위 ?? "kg"),
              구분: "중량 합계",
              ...Object.fromEntries(
                kgQtyColumns.map((c) => [c.key, Number(row[c.key] || 0)]),
              ),
            }))}
            nameKey="상품"
            subKey="용량"
            descKey="구분"
            qtyColumns={kgQtyColumns}
            totalKey="합계"
            searchPlaceholder="품목 검색…"
            primaryActionLabel="카카오 이미지"
            onPrimaryAction={handlePngDownload}
          />

          <section className="card">
            <p className="section-label">Share</p>
            <h3>저장 · 공유</h3>
            <p className="hint" style={{ marginBottom: 12 }}>
              엑셀과 이미지를 받아 카카오톡으로 보내면 됩니다.
            </p>
            <div className="actions">
              <button
                type="button"
                className="primary-button"
                style={{ marginTop: 0 }}
                onClick={handleExcelDownload}
              >
                + 엑셀 다운로드
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={handlePngDownload}
                disabled={!pngPreview}
              >
                카카오 공유용 이미지
              </button>
            </div>
            {pngPreview && (
              <details style={{ marginTop: 12 }}>
                <summary>카카오 공유 이미지 미리보기</summary>
                <div className="preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pngPreview} alt="카카오 공유용 집계 이미지" />
                </div>
              </details>
            )}
          </section>

          <div>
            <p className="section-label">Details</p>
            <h2 style={{ margin: "0 0 10px", fontSize: "1.15rem" }}>
              차수 상세
            </h2>
          </div>

          <div className="tabs">
            {rounds.map((roundNo, idx) => (
              <button
                key={roundNo}
                type="button"
                className={activeTab === idx ? "is-active" : undefined}
                onClick={() => setActiveTab(idx)}
              >
                {roundLabel(roundNo)} 상세
              </button>
            ))}
            <button
              type="button"
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
                  상품: r.품목,
                  용량: r.용량,
                  구분: r.상품,
                  합계: r["총 개수"],
                }),
              );
              const detail = result.details[roundNo] || [];
              return (
                <div className="workspace">
                  {rows.length ? (
                    <ProductionTable
                      rows={rows}
                      nameKey="상품"
                      subKey="용량"
                      descKey="구분"
                      qtyColumns={[
                        {
                          key: "합계",
                          label: "총 개수",
                          unit: "개",
                          emphasize: "total",
                        },
                      ]}
                      totalKey="합계"
                    />
                  ) : (
                    <p className="caption">이 차수에 집계된 고기가 없습니다.</p>
                  )}
                  {detail.length > 0 && (
                    <details>
                      <summary>파싱 상세</summary>
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
                  {totals.unmatched.length > 0 && (
                    <>
                      <p className="caption" style={{ color: "var(--danger)" }}>
                        미인식 항목이 있습니다.
                      </p>
                      <DataTable
                        columns={["원문"]}
                        rows={totals.unmatched.map((t) => ({ 원문: t }))}
                      />
                    </>
                  )}
                </div>
              );
            })()}

          {activeTab === rounds.length && (
            <div className="workspace">
              <ProductionTable
                rows={groupRows.map((row) => ({
                  상품: String(row.품목),
                  용량: String(row.단위 ?? "kg"),
                  구분: "중량 합계",
                  ...Object.fromEntries(
                    kgQtyColumns.map((c) => [c.key, Number(row[c.key] || 0)]),
                  ),
                }))}
                nameKey="상품"
                subKey="용량"
                descKey="구분"
                qtyColumns={kgQtyColumns}
                totalKey="합계"
              />
              <ProductionTable
                rows={allCombined.map((row) => ({
                  상품: String(row.품목 || row.상품),
                  용량: String(row.용량),
                  구분: String(row.품목),
                  ...Object.fromEntries(
                    qtyColumns.map((c) => [c.key, Number(row[c.key] || 0)]),
                  ),
                }))}
                nameKey="상품"
                subKey="용량"
                descKey="구분"
                qtyColumns={qtyColumns}
                totalKey="합계"
              />
            </div>
          )}
        </>
      )}

      <p className="note">
        브라우저에서만 처리합니다. Vercel에 배포해도 원본 엑셀은 서버로 올라가지
        않습니다.
      </p>
    </div>
  );
}
