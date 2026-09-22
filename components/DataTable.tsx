"use client";

import { useMemo, useState } from "react";

export function DataTable({
  columns,
  rows,
  searchKeys,
}: {
  columns: string[];
  rows: Array<Record<string, string | number>>;
  searchKeys?: string[];
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    const keys = searchKeys?.length ? searchKeys : columns;
    return rows.filter((row) =>
      keys.some((key) => String(row[key] ?? "").toLowerCase().includes(q)),
    );
  }, [rows, query, columns, searchKeys]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  const display = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  };

  return (
    <div className="table-card">
      <div className="table-toolbar">
        <div className="toolbar-left">
          <label className="search-box">
            <span aria-hidden>⌕</span>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search..."
            />
          </label>
        </div>
      </div>
      <div className="table-scroll">
        {filtered.length === 0 ? (
          <div className="empty-cell">표시할 행이 없습니다.</div>
        ) : (
          <table className="saas">
            <thead>
              <tr>
                <th>#</th>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, idx) => (
                <tr key={start + idx}>
                  <td className="index">{start + idx + 1}</td>
                  {columns.map((col) => (
                    <td key={col}>
                      <div className="cell-title" style={{ fontWeight: 600 }}>
                        {display(row[col])}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
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
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
