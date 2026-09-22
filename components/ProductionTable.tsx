"use client";

import { useMemo, useState } from "react";

export type QtyColumn = {
  key: string;
  label: string;
  unit?: string;
  emphasize?: "total" | "plain";
};

function formatAmount(value: unknown): string {
  if (value === null || value === undefined || value === "") return "0";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function statusForTotal(total: number): { label: string; tone: string } {
  if (total > 0) return { label: "주문", tone: "paid" };
  return { label: "없음", tone: "inactive" };
}

export function ProductionTable({
  title,
  rows,
  nameKey,
  subKey,
  descKey,
  qtyColumns,
  totalKey,
  primaryActionLabel,
  onPrimaryAction,
  searchPlaceholder = "상품 검색…",
}: {
  title?: string;
  rows: Array<Record<string, string | number>>;
  nameKey: string;
  subKey?: string;
  descKey?: string;
  qtyColumns: QtyColumn[];
  totalKey?: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const blob = [row[nameKey], subKey ? row[subKey] : "", descKey ? row[descKey] : ""]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      return blob.includes(q);
    });
  }, [rows, query, nameKey, subKey, descKey]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(pageRows.map((_, idx) => start + idx)));
  };

  const toggleOne = (absoluteIndex: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(absoluteIndex);
      else next.delete(absoluteIndex);
      return next;
    });
  };

  const allChecked =
    pageRows.length > 0 &&
    pageRows.every((_, idx) => selected.has(start + idx));

  return (
    <div className="table-card">
      <div className="table-toolbar">
        <div className="toolbar-left">
          {selected.size > 0 ? (
            <>
              <span className="selection-meta">{selected.size} selected</span>
              <button
                type="button"
                className="ghost-button danger"
                onClick={() => setSelected(new Set())}
                aria-label="선택 해제"
              >
                ✕ 선택 해제
              </button>
            </>
          ) : (
            <>
              <button type="button" className="icon-button" aria-label="필터" title="필터">
                ⇅
              </button>
              <label className="search-box">
                <span aria-hidden>⌕</span>
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder={searchPlaceholder}
                />
              </label>
            </>
          )}
        </div>
        <div className="toolbar-right">
          {title ? <span className="selection-meta">{title}</span> : null}
          {primaryActionLabel && onPrimaryAction ? (
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 0 }}
              onClick={onPrimaryAction}
            >
              + {primaryActionLabel}
            </button>
          ) : null}
        </div>
      </div>

      <div className="table-scroll">
        {filtered.length === 0 ? (
          <div className="empty-cell">표시할 행이 없습니다.</div>
        ) : (
          <table className="saas">
            <thead>
              <tr>
                <th className="check">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="전체 선택"
                  />
                </th>
                <th>#</th>
                <th>상품</th>
                {descKey ? <th>구분</th> : null}
                <th>상태</th>
                {qtyColumns.map((col) => (
                  <th key={col.key} className="num">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, idx) => {
                const absoluteIndex = start + idx;
                const isSelected = selected.has(absoluteIndex);
                const total = Number(row[totalKey || "합계"] || 0);
                const status = statusForTotal(total);
                return (
                  <tr
                    key={`${row[nameKey]}-${absoluteIndex}`}
                    className={isSelected ? "is-selected" : undefined}
                  >
                    <td className="check">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) =>
                          toggleOne(absoluteIndex, e.target.checked)
                        }
                        aria-label={`${row[nameKey]} 선택`}
                      />
                    </td>
                    <td className="index">{absoluteIndex + 1}</td>
                    <td>
                      <div className="cell-title">{String(row[nameKey] ?? "")}</div>
                      {subKey ? (
                        <div className="cell-sub">{String(row[subKey] ?? "")}</div>
                      ) : null}
                    </td>
                    {descKey ? (
                      <td>
                        <div className="cell-desc">
                          {String(row[descKey] ?? "")}
                        </div>
                      </td>
                    ) : null}
                    <td>
                      <span className={`pill ${status.tone}`}>{status.label}</span>
                    </td>
                    {qtyColumns.map((col) => {
                      const amount = Number(row[col.key] || 0);
                      const zero = !amount;
                      const totalTone =
                        col.emphasize === "total" && amount > 0
                          ? "is-total"
                          : zero
                            ? "is-zero"
                            : "";
                      return (
                        <td key={col.key} className="num">
                          <div className={`qty-stack ${totalTone}`}>
                            <span className="amount">{formatAmount(amount)}</span>
                            <span className="unit">{col.unit || "개"}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="table-footer">
        <div>
          {filtered.length
            ? `${start + 1}-${Math.min(start + pageSize, filtered.length)} of ${filtered.length}`
            : "0 of 0"}
        </div>
        <div className="pager">
          <label>
            Rows per page{" "}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="pager-nav">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="이전 페이지"
            >
              ‹
            </button>
            <span>
              {safePage}/{pageCount}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              aria-label="다음 페이지"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
