"use client";

import { useId, useState } from "react";
import { MANUAL_CATALOG, sizesOf, type ManualLine } from "@/lib/aggregator/manual";

const FIRST = MANUAL_CATALOG.find((c) => c.product === "육회") ?? MANUAL_CATALOG[0];

/** 화면에서 넣는 줄 묶음의 문구. 식당 주문과 환불이 같은 입력 방식을 씁니다. */
export type LineBundleCopy = {
  id: string;
  title: string;
  hint: string;
  memoLabel: string;
  memoPlaceholder: string;
  listLabel: string;
  emptyText: string;
  saveLabel: string;
  helpText: string;
};

export const RESTAURANT_COPY: LineBundleCopy = {
  id: "manual",
  title: "식당 주문",
  hint: "엑셀에 없는 식당 주문을 넣습니다. 결과표에서 \"식당\" 열로 보입니다.",
  memoLabel: "식당 이름",
  memoPlaceholder: "식당 이름 (목록에서 고르거나 새로 입력)",
  listLabel: "넣은 식당 주문",
  emptyText: "넣은 식당 주문이 없습니다.",
  saveLabel: "식당 주문 저장",
  helpText:
    "Enter로도 추가됩니다. 식당 이름은 다음 줄에도 남습니다. 처음 쓰는 식당은 저장하면 다음부터 목록에 나옵니다. 아래 줄을 누르면 위로 올라와 고칠 수 있습니다.",
};

export const REFUND_COPY: LineBundleCopy = {
  id: "refund",
  title: "환불",
  hint: "만들기 전에 취소된 수량을 넣습니다. 결과표의 \"환불\" 열에 마이너스로 보이고 합계에서 빠집니다. 카카오 이미지에는 합계만 반영됩니다.",
  memoLabel: "메모",
  memoPlaceholder: "메모 (예: 쿠팡 주문번호, 고객명)",
  listLabel: "넣은 환불",
  emptyText: "넣은 환불이 없습니다.",
  saveLabel: "환불 저장",
  helpText: "Enter로도 추가됩니다. 아래 줄을 누르면 위로 올라와 고칠 수 있습니다.",
};

/** 줄 묶음 입력 카드: 위에 입력 한 줄, 아래에 넣은 줄 목록. 줄을 누르면 입력 줄로 올라와 고칠 수 있습니다. */
export function ManualEntry({
  copy,
  lines,
  onLines,
  status,
  saving,
  dirty,
  onSave,
  note,
  suggestions = [],
  blockReason = "",
}: {
  copy: LineBundleCopy;
  lines: ManualLine[];
  onLines: (lines: ManualLine[]) => void;
  status: string;
  saving: boolean;
  dirty: boolean;
  onSave: () => void;
  note: string;
  suggestions?: string[];
  /** 비어 있지 않으면 저장을 막고 이 문구를 경고로 보여 줍니다. */
  blockReason?: string;
}) {
  const suggestionListId = useId();
  const titleId = `${copy.id}-title`;
  const [product, setProduct] = useState(FIRST.product);
  const [size, setSize] = useState(FIRST.sizes.at(-1) ?? FIRST.sizes[0]);
  const [qty, setQty] = useState("1");
  const [memo, setMemo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  // 평소에는 접어 두고 제목 줄에 줄 수·저장 상태만 보여 줍니다. 고치던 내용이 있으면 펼친 채로 둡니다.
  const [open, setOpen] = useState(false);
  const expanded = open || dirty || Boolean(blockReason);

  const qtyNumber = Number(qty);
  const qtyValid = Number.isInteger(qtyNumber) && qtyNumber > 0;

  const reset = () => {
    setQty("1");
    setEditingId(null);
  };

  const submit = () => {
    if (!qtyValid) return;
    const line = { product, size, qty: qtyNumber, memo: memo.trim() };
    if (editingId) {
      onLines(lines.map((l) => (l.id === editingId ? { ...l, ...line } : l)));
    } else {
      onLines([...lines, { id: crypto.randomUUID(), ...line }]);
    }
    reset();
  };

  const startEdit = (line: ManualLine) => {
    setProduct(line.product);
    setSize(line.size);
    setQty(String(line.qty));
    setMemo(line.memo);
    setEditingId(line.id);
  };

  return (
    <section className="card line-bundle" aria-labelledby={titleId}>
      <button
        type="button"
        className="bundle-toggle"
        aria-expanded={expanded}
        onClick={() => setOpen(!expanded)}
      >
        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        <h2 id={titleId}>{copy.title}</h2>
        <span className="caption">
          {lines.length ? `${lines.length}줄` : "없음"} · {status}
        </span>
      </button>
      {expanded && (
        <>
          <p className="hint" style={{ margin: "6px 0 12px" }}>{copy.hint}</p>

          <form
            className="manual-form"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label>
              <span className="sr-only">품목</span>
              <select
                value={product}
                onChange={(event) => {
                  setProduct(event.target.value);
                  setSize(sizesOf(event.target.value)[0] ?? "");
                }}
              >
                {MANUAL_CATALOG.map((c) => (
                  <option key={c.product}>{c.product}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">용량</span>
              <select value={size} onChange={(event) => setSize(event.target.value)}>
                {sizesOf(product).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <span aria-hidden="true">×</span>
            <label>
              <span className="sr-only">수량</span>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={qty}
                onChange={(event) => setQty(event.target.value)}
                className="manual-qty"
                aria-invalid={!qtyValid}
              />
            </label>
            <label className="manual-memo">
              <span className="sr-only">{copy.memoLabel}</span>
              <input
                value={memo}
                placeholder={copy.memoPlaceholder}
                list={suggestions.length ? suggestionListId : undefined}
                autoComplete="off"
                onChange={(event) => setMemo(event.target.value)}
              />
              {suggestions.length ? (
                <datalist id={suggestionListId}>
                  {suggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              ) : null}
            </label>
            <button type="submit" className="primary-button" style={{ marginTop: 0 }} disabled={!qtyValid}>
              {editingId ? "고치기" : "추가"}
            </button>
            {editingId && (
              <button type="button" className="ghost-button" onClick={reset}>
                취소
              </button>
            )}
          </form>
          <p className="hint" style={{ margin: "8px 0 12px" }}>
            {copy.helpText}
          </p>

          {lines.length ? (
            <ul className="upload-list" aria-label={copy.listLabel}>
              {lines.map((l) => (
                <li key={l.id} className={l.id === editingId ? "is-editing" : undefined}>
                  <button
                    type="button"
                    className="manual-line"
                    onClick={() => startEdit(l)}
                    aria-label={`${l.product} ${l.size} ${l.qty}개${l.memo ? `, ${l.memo}` : ""} 고치기`}
                  >
                    <strong>
                      {l.product} {l.size}
                    </strong>{" "}
                    × {l.qty}
                    {l.memo ? <span className="caption"> · {l.memo}</span> : null}
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      onLines(lines.filter((x) => x.id !== l.id));
                      if (editingId === l.id) reset();
                    }}
                  >
                    지우기
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="file-name">{copy.emptyText}</p>
          )}

          {blockReason ? (
            <p className="status-error" role="alert" style={{ margin: "12px 0 0" }}>
              {blockReason}
            </p>
          ) : null}
          <div className="actions" style={{ marginTop: 12, alignItems: "center" }}>
            <button
              type="button"
              className="ghost-button"
              onClick={onSave}
              disabled={saving || !dirty || Boolean(blockReason)}
            >
              {saving ? "저장 중…" : dirty ? copy.saveLabel : "저장됨"}
            </button>
            <span className="caption" aria-live="polite">
              {note}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
