export type QtyColumn = {
  key: string;
  label: string;
  unit?: string;
  emphasize?: "total" | "plain";
};

function formatAmount(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

/** 작업 지시서형 수량표: 페이지·선택·검색 없이 전체 행을 한 번에 보여 줍니다. */
export function ProductionTable({
  caption,
  rows,
  nameKey,
  subKey,
  subLabel = "용량",
  qtyColumns,
}: {
  caption: string;
  rows: Array<Record<string, string | number>>;
  nameKey: string;
  subKey?: string;
  subLabel?: string;
  qtyColumns: QtyColumn[];
}) {
  if (!rows.length) {
    return <p className="empty-cell">표시할 품목이 없습니다.</p>;
  }

  return (
    <div className="sheet">
      <div className="table-scroll">
        <table className="worksheet">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">품목</th>
              {subKey ? <th scope="col">{subLabel}</th> : null}
              {qtyColumns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={col.emphasize === "total" ? "num total" : "num"}
                >
                  {col.label}
                  {col.unit ? <span className="unit">{col.unit}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const name = String(row[nameKey] ?? "");
              const groupStart =
                idx > 0 && name !== String(rows[idx - 1][nameKey] ?? "");
              return (
                <tr
                  key={`${name}-${idx}`}
                  className={groupStart ? "group-start" : undefined}
                >
                  <th scope="row" className="name">
                    {name}
                  </th>
                  {subKey ? (
                    <td className="size">{String(row[subKey] ?? "")}</td>
                  ) : null}
                  {qtyColumns.map((col) => {
                    const amount = Number(row[col.key] || 0);
                    const classes = ["num"];
                    if (col.emphasize === "total") classes.push("total");
                    if (!amount) classes.push("zero");
                    return (
                      <td key={col.key} className={classes.join(" ")}>
                        {amount ? (
                          formatAmount(amount)
                        ) : (
                          <>
                            <span aria-hidden="true">–</span>
                            <span className="sr-only">0</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
