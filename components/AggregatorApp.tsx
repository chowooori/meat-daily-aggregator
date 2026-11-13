"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  combineBatches,
  findOverRefunds,
  MANUAL_ROUND,
  REFUND_ROUND,
  meatGroupSubtotals,
  roundLabel,
  sortRounds,
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
import {
  buildManualRows,
  manualLinesToTotals,
  manualSignature,
  type ManualLine,
} from "@/lib/aggregator/manual";
import { savedRowsToTotals } from "@/lib/aggregator/savedRounds";
import {
  buildWatchRows,
  matchWatchBusiness,
  WATCH_BUSINESSES,
  watchNotices,
  type WatchBusiness,
  type WatchHit,
} from "@/lib/aggregator/watchBusinesses";
import { productionRows } from "@/lib/aggregator/summary";
import {
  buildProductionRows,
  fetchRestaurantNames,
  fetchSavedRounds,
  fetchWatchBusinesses,
  saveProductionJob,
  type SavedRound,
} from "@/lib/supabase/saveProduction";
import { DataTable } from "./DataTable";
import {
  FileDropMulti,
  ROUND_CHOICES,
  uploadKey,
  type Upload,
} from "./FileDropMulti";
import { ManualEntry, REFUND_COPY, RESTAURANT_COPY } from "./ManualEntry";
import { ProductionTable, type QtyColumn } from "./ProductionTable";
import { WatchBusinessManager } from "./WatchBusinessManager";

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
  /** 이번에 올린 파일에서 찾은 확인 업체 주문. */
  watch: WatchHit[];
};

type SavedState = {
  date: string;
  reloadKey: number;
  rounds: SavedRound[];
  error: string;
};

function savedManualLines(rounds: SavedRound[], round = MANUAL_ROUND): ManualLine[] {
  const manual = rounds.find((r) => r.round === round);
  return (manual?.rows ?? []).map((row, idx) => ({
    id: `saved-${manual?.jobId}-${idx}`,
    product: row.product,
    size: row.sizeLabel,
    qty: row.qty,
    memo: row.memo ?? "",
  }));
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const VIEWS = [
  { key: "input", label: "입력" },
  { key: "result", label: "결과·공유" },
  { key: "settings", label: "설정" },
] as const;

type View = (typeof VIEWS)[number]["key"];

export function AggregatorApp() {
  const [view, setView] = useState<View>("input");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [reportDateStr, setReportDateStr] = useState(todayInputValue);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [savedState, setSavedState] = useState<SavedState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [ackUnmatched, setAckUnmatched] = useState(false);
  const [manualLines, setManualLines] = useState<ManualLine[]>([]);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualNote, setManualNote] = useState("");
  const [savedRestaurants, setSavedRestaurants] = useState<string[]>([]);
  const [watchBusinesses, setWatchBusinesses] = useState<WatchBusiness[]>([...WATCH_BUSINESSES]);

  useEffect(() => {
    let cancelled = false;
    void fetchWatchBusinesses().then((list) => {
      // 한 번도 저장하지 않았으면(null) 처음 목록을 그대로 씁니다.
      if (!cancelled && list) setWatchBusinesses(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const manualKeepRef = useRef<{ date: string; dirty: boolean }>({ date: "", dirty: false });
  const [refundLines, setRefundLines] = useState<ManualLine[]>([]);
  const [refundSaving, setRefundSaving] = useState(false);
  const [refundNote, setRefundNote] = useState("");
  const refundKeepRef = useRef<{ date: string; dirty: boolean }>({ date: "", dirty: false });

  useEffect(() => {
    let cancelled = false;
    void fetchRestaurantNames().then((names) => {
      if (!cancelled) setSavedRestaurants(names);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    void fetchSavedRounds(reportDateStr).then((loaded) => {
      if (cancelled) return;
      const rounds = loaded.ok ? loaded.rounds : [];
      setSavedState({
        date: reportDateStr,
        reloadKey,
        rounds,
        error: loaded.ok ? "" : loaded.error,
      });
      // 같은 날짜에서 고치던 식당 주문이 있으면 덮어쓰지 않습니다.
      const keep = manualKeepRef.current;
      if (!(keep.date === reportDateStr && keep.dirty)) {
        setManualLines(savedManualLines(rounds));
      }
      const refundKeep = refundKeepRef.current;
      if (!(refundKeep.date === reportDateStr && refundKeep.dirty)) {
        setRefundLines(savedManualLines(rounds, REFUND_ROUND));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reportDateStr, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!uploads.length) {
        setResult(null);
        return;
      }
      setLoading(true);
      const batches: Record<number, DailyTotals> = {};
      const details: Record<number, DetailRow[]> = {};
      const watch: WatchHit[] = [];
      const errors: string[] = [];

      for (const { file, round: roundNo } of uploads) {
        try {
          const rows = await readOrdersMatrix(file);
          const { totals, detail, watch: fileWatch } = aggregateOrders(rows, watchBusinesses);
          watch.push(...fileWatch.map((hit) => ({ ...hit, round: roundNo })));
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
        setResult({ batches, details, errors, watch });
        setActiveTab(0);
        setSaveNote("");
        setConfirmOverwrite(false);
        setAckUnmatched(false);
        setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [uploads, watchBusinesses]);

  const reportDate = useMemo(
    () => parseDateInput(reportDateStr),
    [reportDateStr],
  );

  const savedLoading =
    savedState?.date !== reportDateStr || savedState?.reloadKey !== reloadKey;
  // 저장 직후 다시 불러오는 동안에도 같은 날짜의 이전 결과는 그대로 보여 줍니다.
  const savedRounds = useMemo(
    () =>
      savedState && savedState.date === reportDateStr
        ? savedState.rounds.filter((r) => r.round >= 1 && r.round <= 3)
        : [],
    [savedState, reportDateStr],
  );

  const uploadedBatches = useMemo(() => result?.batches ?? {}, [result]);
  const uploadedRounds = useMemo(
    () =>
      Object.keys(uploadedBatches)
        .map(Number)
        .sort((a, b) => a - b),
    [uploadedBatches],
  );

  const savedManual = useMemo(
    () =>
      savedState && savedState.date === reportDateStr
        ? savedManualLines(savedState.rounds)
        : [],
    [savedState, reportDateStr],
  );
  const savedManualRound = savedState?.date === reportDateStr
    ? savedState.rounds.find((r) => r.round === MANUAL_ROUND)
    : undefined;
  const manualDirty = manualSignature(manualLines) !== manualSignature(savedManual);
  const savedRefunds = useMemo(
    () =>
      savedState && savedState.date === reportDateStr
        ? savedManualLines(savedState.rounds, REFUND_ROUND)
        : [],
    [savedState, reportDateStr],
  );
  const savedRefundRound = savedState?.date === reportDateStr
    ? savedState.rounds.find((r) => r.round === REFUND_ROUND)
    : undefined;
  const refundDirty = manualSignature(refundLines) !== manualSignature(savedRefunds);

  useEffect(() => {
    refundKeepRef.current = { date: reportDateStr, dirty: refundDirty };
  }, [reportDateStr, refundDirty]);

  const restaurantNames = useMemo(() => {
    const names = [...savedRestaurants];
    for (const line of manualLines) {
      if (line.memo && !names.includes(line.memo)) names.push(line.memo);
    }
    return names;
  }, [savedRestaurants, manualLines]);

  useEffect(() => {
    manualKeepRef.current = { date: reportDateStr, dirty: manualDirty };
  }, [reportDateStr, manualDirty]);

  /** 저장된 차수 위에 이번에 올린 차수를 덮어 합치고, 화면의 식당 주문을 "식당" 열로 더한 오늘의 누적 집계. */
  const batches = useMemo(() => {
    const merged: Record<number, DailyTotals> = {};
    for (const saved of savedRounds) merged[saved.round] = savedRowsToTotals(saved.rows);
    if (manualLines.length) merged[MANUAL_ROUND] = manualLinesToTotals(manualLines);
    if (refundLines.length) merged[REFUND_ROUND] = manualLinesToTotals(refundLines);
    return { ...merged, ...uploadedBatches };
  }, [savedRounds, uploadedBatches, manualLines, refundLines]);

  const rounds = useMemo(() => sortRounds(Object.keys(batches).map(Number)), [batches]);

  const unsavedRounds = useMemo(
    () =>
      ROUND_CHOICES.filter((r) =>
        uploads.some((u) => u.round === r && !savedKeys.has(uploadKey(u))),
      ),
    [uploads, savedKeys],
  );

  const combined = useMemo(
    () => (rounds.length ? combineBatches(batches, { onlyOrdered: true }) : []),
    [batches, rounds],
  );

  const allCombined = useMemo(
    () => (rounds.length ? combineBatches(batches, { onlyOrdered: false }) : []),
    [batches, rounds],
  );

  const unmatched = useMemo(
    () =>
      uploadedRounds.flatMap((roundNo) =>
        uploadedBatches[roundNo].unmatched.map((text) => ({ roundNo, text })),
      ),
    [uploadedBatches, uploadedRounds],
  );
  const shareBlocked = unmatched.length > 0 && !ackUnmatched;

  const roundStatus = ROUND_CHOICES.map((r) => {
    const saved = savedRounds.find((s) => s.round === r);
    if (unsavedRounds.includes(r)) return { round: r, text: `${r}차 올림(미저장)`, tone: "pending" };
    if (saved) return { round: r, text: `${r}차 저장됨 ${hhmm(saved.savedAt)}`, tone: "saved" };
    return { round: r, text: `${r}차 없음`, tone: "none" };
  });
  const manualStatus = manualDirty
    ? { round: MANUAL_ROUND, text: "식당 수정됨(미저장)", tone: "pending" }
    : savedManualRound && savedManual.length
      ? { round: MANUAL_ROUND, text: `식당 저장됨 ${hhmm(savedManualRound.savedAt)}`, tone: "saved" }
      : { round: MANUAL_ROUND, text: "식당 없음", tone: "none" };
  /** 확인 업체 주문: 올린 차수는 파일에서, 나머지 차수는 저장분에서, 식당 주문은 식당 이름으로 찾습니다. */
  const watchHits = useMemo<WatchHit[]>(
    () => [
      ...(result?.watch ?? []),
      ...savedRounds
        .filter((saved) => !uploadedRounds.includes(saved.round))
        .flatMap((saved) => saved.watch.map((w) => ({ ...w, round: saved.round }))),
      ...manualLines.flatMap((line) => {
        const business = matchWatchBusiness([line.memo], watchBusinesses);
        return business
          ? [{ business: business.name, item: `${line.product} ${line.size}`, qty: line.qty, round: MANUAL_ROUND }]
          : [];
      }),
    ],
    [result, savedRounds, uploadedRounds, manualLines, watchBusinesses],
  );
  const notices = useMemo(
    () => watchNotices(watchHits, watchBusinesses),
    [watchHits, watchBusinesses],
  );
  const noticesKey = notices.join("\n");

  const refundStatus = refundDirty
    ? { round: REFUND_ROUND, text: "환불 수정됨(미저장)", tone: "pending" }
    : savedRefundRound && savedRefunds.length
      ? { round: REFUND_ROUND, text: `환불 저장됨 ${hhmm(savedRefundRound.savedAt)}`, tone: "saved" }
      : { round: REFUND_ROUND, text: "환불 없음", tone: "none" };
  const overRefunds = findOverRefunds(allCombined);
  const refundBlock = overRefunds.length
    ? `환불이 주문보다 많습니다: ${overRefunds
        .map((o) => `${o.상품} (주문 ${o.ordered}, 환불 ${o.refunded})`)
        .join(", ")}. 수량을 확인해 주세요.`
    : "";
  const unsavedLabels = [
    ...unsavedRounds.map((r) => `${r}차`),
    ...(manualDirty ? ["식당 주문"] : []),
    ...(refundDirty ? ["환불"] : []),
  ];
  const overwriteTargets = unsavedRounds
    .map((r) => savedRounds.find((s) => s.round === r))
    .filter((s): s is SavedRound => Boolean(s));

  const roundCols = useMemo(() => rounds.map(roundLabel), [rounds]);
  // 작업장용 카카오 이미지에는 환불 열을 넣지 않고, 합계에만 환불을 반영합니다.
  const pngRounds = useMemo(() => rounds.filter((r) => r !== REFUND_ROUND), [rounds]);
  const pngCols = useMemo(
    () => ["품목", "용량", ...pngRounds.map(roundLabel), "합계"],
    [pngRounds],
  );
  const hasRefunds = rounds.includes(REFUND_ROUND);
  const groupRows = useMemo(
    () => meatGroupSubtotals(allCombined, rounds),
    [allCombined, rounds],
  );

  const qtyColumns: QtyColumn[] = useMemo(
    () => [
      ...roundCols.map((col) => ({ key: col, label: col })),
      { key: "합계", label: "합계", emphasize: "total" as const },
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
      return renderSharePng(
        qtyRows,
        groupRows,
        pngRounds,
        reportDate,
        new Date(),
        hasRefunds ? "합계는 환불을 뺀 수량입니다." : "",
        noticesKey ? noticesKey.split("\n") : [],
      );
    } catch {
      return null;
    }
  }, [combined, pngCols, groupRows, pngRounds, reportDate, hasRefunds, noticesKey]);

  const handleExcelDownload = () => {
    if (!rounds.length) return;
    const bytes = reportBytes(reportDate, batches, manualLines, refundLines);
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

  /** 이번에 올린 차수만, 차수 하나당 저장 1건으로 저장합니다. 이미 저장된 차수는 먼저 확인을 받습니다. */
  const handleDbSave = async (confirmed = false) => {
    if (!result || !unsavedRounds.length || saving || shareBlocked) return;
    if (overwriteTargets.length && !confirmed) {
      setConfirmOverwrite(true);
      return;
    }
    setConfirmOverwrite(false);
    setSaving(true);
    setSaveNote("");

    const done: number[] = [];
    let failure = "";
    for (const roundNo of unsavedRounds) {
      const totals = uploadedBatches[roundNo];
      if (!totals) continue;
      const roundRows = combineBatches({ [roundNo]: totals }, { onlyOrdered: true });
      const roundGroups = meatGroupSubtotals(roundRows, [roundNo]);
      const roundPacks = roundRows.reduce((sum, row) => sum + Number(row.합계 || 0), 0);
      const files = uploads.filter((u) => u.round === roundNo).map((u) => u.file.name);
      const fileErrors = result.errors.filter((msg) => files.some((f) => msg.startsWith(`${f}:`)));
      const saved = await saveProductionJob({
        reportDate,
        sourceFiles: files,
        rounds: [roundNo],
        skuCount: roundRows.length,
        packCount: roundPacks,
        unmatchedCount: totals.unmatched.length,
        status: fileErrors.length ? "partial" : "ok",
        message: fileErrors.length
          ? fileErrors.join(" / ")
          : `${roundNo}차 ${roundRows.length}종 · ${roundPacks}개 저장`,
        rows: (() => {
          const rows = buildProductionRows(roundRows, roundGroups, [roundNo]);
          const hits = (result.watch ?? []).filter((hit) => hit.round === roundNo);
          return [...rows, ...buildWatchRows(hits, rows.length + 1)];
        })(),
      });
      if (!saved.ok) {
        failure = `${roundNo}차를 저장하지 못했습니다. ${saved.error || ""}`.trim();
        break;
      }
      done.push(roundNo);
    }

    setSaving(false);
    if (done.length) {
      setSavedKeys((prev) => {
        const next = new Set(prev);
        for (const u of uploads) if (done.includes(u.round)) next.add(uploadKey(u));
        return next;
      });
      setReloadKey((k) => k + 1);
    }
    const doneText = done.length
      ? `${reportDate.getMonth() + 1}월 ${reportDate.getDate()}일 ${done.join("·")}차 집계를 저장했습니다.`
      : "";
    setSaveNote([doneText, failure].filter(Boolean).join(" "));
  };

  const requestDateChange = (value: string) => {
    if (!value || value === reportDateStr) return;
    if (unsavedLabels.length) {
      setPendingDate(value);
      return;
    }
    setUploads([]);
    setSavedKeys(new Set());
    setManualLines([]);
    setManualNote("");
    setRefundLines([]);
    setRefundNote("");
    setReportDateStr(value);
  };

  /** 그날의 식당 주문 전체를 한 묶음(차수 0)으로 저장합니다. 다시 저장하면 최신본이 됩니다. */
  const handleManualSave = async () => {
    if (manualSaving || !manualDirty) return;
    setManualSaving(true);
    setManualNote("");
    const packCount = manualLines.reduce((sum, l) => sum + l.qty, 0);
    const saved = await saveProductionJob({
      reportDate,
      sourceFiles: [],
      rounds: [MANUAL_ROUND],
      skuCount: manualLines.length,
      packCount,
      unmatchedCount: 0,
      status: "ok",
      message: `식당 ${manualLines.length}줄 · ${packCount}개 저장`,
      rows: buildManualRows(manualLines),
    });
    setManualSaving(false);
    if (saved.ok) {
      manualKeepRef.current = { date: reportDateStr, dirty: false };
      setManualNote(`${reportDate.getMonth() + 1}월 ${reportDate.getDate()}일 식당 주문을 저장했습니다.`);
      setReloadKey((k) => k + 1);
    } else {
      setManualNote(`저장하지 못했습니다. ${saved.error || ""}`.trim());
    }
  };

  /** 그날의 환불 전체를 한 묶음(차수 -1)으로 저장합니다. 주문보다 많은 환불이 있으면 저장하지 않습니다. */
  const handleRefundSave = async () => {
    if (refundSaving || !refundDirty || refundBlock) return;
    setRefundSaving(true);
    setRefundNote("");
    const packCount = refundLines.reduce((sum, l) => sum + l.qty, 0);
    const saved = await saveProductionJob({
      reportDate,
      sourceFiles: [],
      rounds: [REFUND_ROUND],
      skuCount: refundLines.length,
      packCount,
      unmatchedCount: 0,
      status: "ok",
      message: `환불 ${refundLines.length}줄 · ${packCount}개 저장`,
      rows: buildManualRows(refundLines),
    });
    setRefundSaving(false);
    if (saved.ok) {
      refundKeepRef.current = { date: reportDateStr, dirty: false };
      setRefundNote(`${reportDate.getMonth() + 1}월 ${reportDate.getDate()}일 환불을 저장했습니다.`);
      setReloadKey((k) => k + 1);
    } else {
      setRefundNote(`저장하지 못했습니다. ${saved.error || ""}`.trim());
    }
  };

  const confirmDateChange = () => {
    if (!pendingDate) return;
    setUploads([]);
    setSavedKeys(new Set());
    setManualLines([]);
    setManualNote("");
    manualKeepRef.current = { date: "", dirty: false };
    setRefundLines([]);
    setRefundNote("");
    refundKeepRef.current = { date: "", dirty: false };
    setReportDateStr(pendingDate);
    setPendingDate(null);
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
      <section className="card control-bar" aria-label="생산일자와 저장 상태">
        <div className="control-row">
          <div className="date-field">
            <label htmlFor="report-date">생산일자</label>
            <input
              id="report-date"
              type="date"
              value={reportDateStr}
              onChange={(e) => requestDateChange(e.target.value)}
            />
          </div>
        <p className="round-status" aria-live="polite">
          {savedLoading ? (
            "저장된 집계를 불러오는 중…"
          ) : savedState?.error ? (
            <span className="status-error">저장된 집계를 불러오지 못했습니다. {savedState.error}</span>
          ) : (
            [...roundStatus, manualStatus, refundStatus].map((s) => (
              <span key={s.round} className={`status-chip ${s.tone}`}>
                {s.text}
              </span>
            ))
          )}
        </p>
        </div>
        {pendingDate && (
          <div className="confirm-box" role="alertdialog" aria-labelledby="date-confirm-title">
            <p id="date-confirm-title">
              아직 저장하지 않은 것이 있습니다({unsavedLabels.join(", ")}). 날짜를 바꾸면
              올린 파일과 고치던 식당 주문이 비워집니다.
            </p>
            <div className="actions">
              <button type="button" className="primary-button" style={{ marginTop: 0 }} onClick={confirmDateChange}>
                날짜 바꾸기
              </button>
              <button type="button" className="ghost-button" onClick={() => setPendingDate(null)}>
                취소
              </button>
            </div>
          </div>
        )}
      </section>

      <nav className="view-tabs" role="tablist" aria-label="화면">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            className={view === v.key ? "is-active" : undefined}
            onClick={() => setView(v.key)}
          >
            {v.label}
            {v.key === "result" && notices.length > 0 ? (
              <span className="tab-badge">주의 {notices.length}</span>
            ) : null}
            {v.key === "input" && unsavedLabels.length > 0 ? (
              <span className="tab-badge pending">미저장</span>
            ) : null}
          </button>
        ))}
      </nav>

      {view === "input" && (
        <>
          <section className="card" aria-labelledby="upload-title">
            <h2 id="upload-title">발송 엑셀 업로드</h2>
            <p className="hint" style={{ marginBottom: 12 }}>
              파일마다 차수를 고르세요. 파일명 끝이 01·02·03이면 자동으로 골라집니다. 같은 날짜에
              저장한 차수는 자동으로 불러와 합칩니다.
            </p>
          <FileDropMulti uploads={uploads} onUploads={setUploads} />
          {uploads.length > 0 && (
            <div className="actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setUploads([])}
              >
                선택 초기화
              </button>
            </div>
          )}
            {uploads.length > 0 && (
              <div className="actions" style={{ marginTop: 12, alignItems: "center" }}>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void handleDbSave()}
                    disabled={saving || shareBlocked || !unsavedRounds.length}
                  >
                    {saving
                      ? "저장 중…"
                      : unsavedRounds.length
                        ? `${unsavedRounds.join("·")}차 DB 저장`
                        : "저장할 차수 없음"}
                  </button>
                <button type="button" className="ghost-button" onClick={() => setUploads([])}>
                  선택 초기화
                </button>
                {rounds.length > 0 && (
                  <button type="button" className="link-button" onClick={() => setView("result")}>
                    결과 보기 →
                  </button>
                )}
              </div>
            )}
              {confirmOverwrite && overwriteTargets.length > 0 && (
                <div className="confirm-box" role="alertdialog" aria-labelledby="overwrite-title">
                  <p id="overwrite-title">이미 저장된 차수가 있습니다. 새 결과로 바꿀까요?</p>
                  <ul>
                    {overwriteTargets.map((t) => {
                      const totals = uploadedBatches[t.round];
                      const next = totals
                        ? combineBatches({ [t.round]: totals }, { onlyOrdered: true }).reduce(
                            (sum, row) => sum + Number(row.합계 || 0),
                            0,
                          )
                        : 0;
                      return (
                        <li key={t.round}>
                          {t.round}차: {hhmm(t.savedAt)}에 저장된 합계 {t.packCount}개 → 새 합계 {next}개
                        </li>
                      );
                    })}
                  </ul>
                  <p className="caption">이전 기록은 지워지지 않고 이력으로 남습니다.</p>
                  <div className="actions">
                    <button
                      type="button"
                      className="primary-button"
                      style={{ marginTop: 0 }}
                      onClick={() => void handleDbSave(true)}
                    >
                      바꿔서 저장
                    </button>
                    <button type="button" className="ghost-button" onClick={() => setConfirmOverwrite(false)}>
                      취소
                    </button>
                  </div>
                </div>
              )}
            <p className="caption" aria-live="polite" style={{ marginTop: 8 }}>
              {saveNote}
            </p>
          </section>

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

          <ManualEntry
            copy={RESTAURANT_COPY}
            lines={manualLines}
            onLines={setManualLines}
            status={manualStatus.text}
            saving={manualSaving}
            dirty={manualDirty}
            onSave={() => void handleManualSave()}
            note={manualNote}
            suggestions={restaurantNames}
          />

          <ManualEntry
            copy={REFUND_COPY}
            lines={refundLines}
            onLines={setRefundLines}
            status={refundStatus.text}
            saving={refundSaving}
            dirty={refundDirty}
            onSave={() => void handleRefundSave()}
            note={refundNote}
            blockReason={refundBlock}
          />

          {!uploads.length && !rounds.length && (
            <div className="guide-grid">
              <div className="guide-card">
                <div className="guide-num">1</div>
                <h3>생산일자 확인</h3>
                <p>업로드 카드에서 생산일자가 오늘인지 확인합니다.</p>
              </div>
              <div className="guide-card">
                <div className="guide-num">2</div>
                <h3>발송 엑셀 업로드</h3>
                <p>파일마다 1차·2차·3차를 고릅니다. 저장한 차수는 날짜별로 쌓입니다.</p>
              </div>
              <div className="guide-card">
                <div className="guide-num">3</div>
                <h3>엑셀·이미지 공유</h3>
                <p>집계표를 내려받아 카카오톡으로 보내면 됩니다.</p>
              </div>
            </div>
          )}
        </>
      )}

      {view === "result" && (
        <>
          {notices.length > 0 && (
            <section className="watch-box" aria-labelledby="watch-title">
              <h2 id="watch-title">확인 업체 주문</h2>
              <ul>
                {notices.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              <p className="caption">카카오 이미지 아래 &quot;주의 사항&quot;에도 같은 문구가 들어갑니다.</p>
            </section>
          )}

          {rounds.length === 0 ? (
            <p className="empty-cell">
              아직 결과가 없습니다. 입력 탭에서 엑셀을 올리거나, 저장해 둔 날짜를 고르세요.
            </p>
          ) : null}

          {rounds.length > 0 && (
            <>
              <section className="card" aria-labelledby="share-title">
                <h2 id="share-title">공유</h2>
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
                </div>
                {shareBlocked ? (
                  <p className="caption" style={{ marginTop: 8 }}>
                    인식하지 못한 주문을 먼저 확인해 주세요(입력 탭).
                  </p>
                ) : null}
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

    
              <details className="detail-box">
                <summary className="section-title">차수 상세 · 주문별 해석 내역</summary>

                <div className="tabs" role="tablist" aria-label="차수 상세">
                  {uploadedRounds.map((roundNo, idx) => (
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
                    aria-selected={activeTab === uploadedRounds.length}
                    className={activeTab === uploadedRounds.length ? "is-active" : undefined}
                    onClick={() => setActiveTab(uploadedRounds.length)}
                  >
                    전체 용량표
                  </button>
                </div>

                {result && activeTab < uploadedRounds.length &&
                  (() => {
                    const roundNo = uploadedRounds[activeTab];
                    const totals = uploadedBatches[roundNo];
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

                {activeTab >= uploadedRounds.length && (
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
              </details>
            </>
          )}
        </>
      )}

      {view === "settings" && (
        <WatchBusinessManager businesses={watchBusinesses} onSaved={setWatchBusinesses} />
      )}

      <p className="note">
        엑셀 원본은 이 브라우저에서만 읽습니다. 저장할 때는 집계 결과만
        보냅니다.
      </p>
    </div>
  );
}
