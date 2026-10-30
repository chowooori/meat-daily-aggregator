"use client";

import { useId, useState } from "react";
import { MANUAL_CATALOG, sizesOf, type ManualLine } from "@/lib/aggregator/manual";

const FIRST = MANUAL_CATALOG.find((c) => c.product === "육회") ?? MANUAL_CATALOG[0];

/** 식당 주문 카드: 위에 입력 한 줄, 아래에 넣은 줄 목록. 줄을 누르면 입력 줄로 올라와 고칠 수 있습니다. 식당 이름은 저장된 이름에서 고르거나 새로 씁니다. */
export function ManualEntry({
  lines,
  onLines,
  status,
  saving,
  dirty,
  onSave,
  note,
  restaurants,
}: {
  lines: ManualLine[];
  onLines: (lines: ManualLine[]) => void;
  status: string;
  saving: boolean;
  dirty: boolean;
  onSave: () => void;
  note: string;
  restaurants: string[];
}) {
  const restaurantListId = useId();
  const [product, setProduct] = useState(FIRST.product);
  const [size, setSize] = useState(FIRST.sizes.at(-1) ?? FIRST.sizes[0]);
  const [qty, setQty] = useState("1");
  const [memo, setMemo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

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
    <section className="card" aria-labelledby="manual-title">
      <div className="card-head" style={{ alignItems: "baseline" }}>
        <div>
          <h2 id="manual-title">식당 주문</h2>
          <p className="hint">
            엑셀에 없는 식당 주문을 넣습니다. 결과표에서 &quot;식당&quot; 열로 보입니다.
          </p>
        </div>
        <span className="caption">{status}</span>
      </div>

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
          <span className="sr-only">식당 이름</span>
          <input
            value={memo}
            placeholder="식당 이름 (목록에서 고르거나 새로 입력)"
            list={restaurantListId}
            autoComplete="off"
            onChange={(event) => setMemo(event.target.value)}
          />
          <datalist id={restaurantListId}>
            {restaurants.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
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
        Enter로도 추가됩니다. 식당 이름은 다음 줄에도 남습니다. 처음 쓰는 식당은 저장하면 다음부터
        목록에 나옵니다. 아래 줄을 누르면 위로 올라와 고칠 수 있습니다.
      </p>

      {lines.length ? (
        <ul className="upload-list" aria-label="넣은 식당 주문">
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
        <p className="file-name">넣은 식당 주문이 없습니다.</p>
      )}

      <div className="actions" style={{ marginTop: 12, alignItems: "center" }}>
        <button
          type="button"
          className="ghost-button"
          onClick={onSave}
          disabled={saving || !dirty}
        >
          {saving ? "저장 중…" : dirty ? "식당 주문 저장" : "저장됨"}
        </button>
        <span className="caption" aria-live="polite">
          {note}
        </span>
      </div>
    </section>
  );
}
