"use client";

/**
 * PROTOTYPE — 버리는 코드. main에 합치지 않습니다.
 * 질문: "수동 입력 화면은 어디에 어떤 모양으로 놓이는가?"
 * 서로 구조가 다른 시안 3개를 기존 메인 화면 안에 띄우고 `?variant=A|B|C`로 바꿔 봅니다.
 * 저장하지 않습니다(메모리 상태만). 아래 "현재 상태" 상자에 입력값이 그대로 보입니다.
 */

import { useState, useSyncExternalStore } from "react";
import { YUKASHIMI_SIZES, YUKHOE_SIZES } from "@/lib/aggregator/categories";
import { formatSize } from "@/lib/aggregator/summary";

type Line = { id: number; product: string; size: string; qty: number; memo: string };

const CATALOG: Array<{ product: string; sizes: string[] }> = [
  { product: "육사시미", sizes: YUKASHIMI_SIZES.map(formatSize) },
  { product: "육사시미 덩어리", sizes: ["1kg"] },
  { product: "육회", sizes: YUKHOE_SIZES.map(formatSize) },
  { product: "배필", sizes: ["1kg"] },
  { product: "사태", sizes: ["1kg"] },
  { product: "소갈비", sizes: ["1kg"] },
  { product: "소고기 잡육", sizes: ["1kg"] },
  { product: "한돈 잡육", sizes: ["500g"] },
  { product: "소불고기", sizes: ["500g"] },
  { product: "스지", sizes: ["1kg"] },
];

const VARIANTS = [
  { key: "A", name: "줄 편집표" },
  { key: "B", name: "빠른 추가 한 줄" },
  { key: "C", name: "거래처별 주문표" },
] as const;

let nextId = 1;
const newLine = (product = "육회", size = "1kg", qty = 1, memo = ""): Line => ({
  id: nextId++,
  product,
  size,
  qty,
  memo,
});

function sizesOf(product: string): string[] {
  return CATALOG.find((c) => c.product === product)?.sizes ?? ["1kg"];
}

/* ---------- A: 업로드 카드 아래, 엑셀처럼 줄을 직접 고치는 표 ---------- */
function VariantA({ lines, setLines }: { lines: Line[]; setLines: (l: Line[]) => void }) {
  const update = (id: number, patch: Partial<Line>) =>
    setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  return (
    <section className="card" aria-labelledby="manual-a">
      <h2 id="manual-a">수동 입력</h2>
      <p className="hint" style={{ marginBottom: 12 }}>
        식당 등 엑셀에 없는 주문을 직접 넣습니다. 결과표에서 &quot;수동&quot; 열로 보입니다.
      </p>
      <div className="sheet">
        <table className="worksheet">
          <thead>
            <tr>
              <th>품목</th>
              <th>용량</th>
              <th className="num">수량</th>
              <th>메모(거래처)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>
                  <select
                    value={l.product}
                    onChange={(e) =>
                      update(l.id, { product: e.target.value, size: sizesOf(e.target.value)[0] })
                    }
                  >
                    {CATALOG.map((c) => (
                      <option key={c.product}>{c.product}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={l.size} onChange={(e) => update(l.id, { size: e.target.value })}>
                    {sizesOf(l.product).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <input
                    type="number"
                    min={1}
                    value={l.qty}
                    style={{ width: 64, textAlign: "right" }}
                    onChange={(e) => update(l.id, { qty: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    value={l.memo}
                    placeholder="예: ○○식당"
                    onChange={(e) => update(l.id, { memo: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setLines(lines.filter((x) => x.id !== l.id))}
                  >
                    지우기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions" style={{ marginTop: 12 }}>
        <button type="button" className="ghost-button" onClick={() => setLines([...lines, newLine()])}>
          + 줄 추가
        </button>
        <button type="button" className="primary-button" style={{ marginTop: 0 }}>
          수동 입력 저장 (시안: 저장 안 함)
        </button>
      </div>
    </section>
  );
}

/* ---------- B: 한 줄짜리 빠른 추가 + 아래에 쌓이는 목록 ---------- */
function VariantB({ lines, setLines }: { lines: Line[]; setLines: (l: Line[]) => void }) {
  const [product, setProduct] = useState("육회");
  const [size, setSize] = useState("1kg");
  const [qty, setQty] = useState(1);
  const [memo, setMemo] = useState("");
  const add = () => {
    if (qty < 1) return;
    setLines([...lines, newLine(product, size, qty, memo)]);
    setQty(1);
  };
  return (
    <section className="card" aria-labelledby="manual-b">
      <h2 id="manual-b">수동 입력</h2>
      <div
        className="actions"
        style={{ alignItems: "center", marginTop: 8 }}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
        }}
      >
        <select
          value={product}
          onChange={(e) => {
            setProduct(e.target.value);
            setSize(sizesOf(e.target.value)[0]);
          }}
        >
          {CATALOG.map((c) => (
            <option key={c.product}>{c.product}</option>
          ))}
        </select>
        <select value={size} onChange={(e) => setSize(e.target.value)}>
          {sizesOf(product).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span>×</span>
        <input
          type="number"
          min={1}
          value={qty}
          style={{ width: 64 }}
          onChange={(e) => setQty(Number(e.target.value))}
        />
        <input value={memo} placeholder="메모(거래처)" onChange={(e) => setMemo(e.target.value)} />
        <button type="button" className="primary-button" style={{ marginTop: 0 }} onClick={add}>
          추가
        </button>
      </div>
      <p className="hint" style={{ margin: "8px 0 12px" }}>
        Enter로도 추가됩니다. 메모는 다음 줄에도 그대로 남아 같은 거래처를 연달아 넣기 쉽습니다.
      </p>
      {lines.length ? (
        <ul className="upload-list">
          {lines.map((l) => (
            <li key={l.id}>
              <span className="upload-name">
                <strong>
                  {l.product} {l.size}
                </strong>{" "}
                × {l.qty}
                {l.memo ? <span className="caption"> · {l.memo}</span> : null}
              </span>
              <button
                type="button"
                className="link-button"
                onClick={() => setLines(lines.filter((x) => x.id !== l.id))}
              >
                지우기
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="file-name">아직 넣은 수동 주문이 없습니다.</p>
      )}
      <div className="actions" style={{ marginTop: 12 }}>
        <button type="button" className="ghost-button">
          수동 입력 저장 (시안: 저장 안 함)
        </button>
      </div>
    </section>
  );
}

/* ---------- C: 거래처 이름을 먼저 고르고, 전체 품목표에 수량만 채우는 주문서 ---------- */
function VariantC({ lines, setLines }: { lines: Line[]; setLines: (l: Line[]) => void }) {
  const [client, setClient] = useState("");
  const [draft, setDraft] = useState<Record<string, number>>({});
  const clients = [...new Set(lines.map((l) => l.memo || "(메모 없음)"))];
  const commit = () => {
    const added = Object.entries(draft)
      .filter(([, q]) => q > 0)
      .map(([key, q]) => {
        const [product, size] = key.split("|");
        return newLine(product, size, q, client);
      });
    if (!added.length) return;
    setLines([...lines, ...added]);
    setDraft({});
    setClient("");
  };
  return (
    <section className="card" aria-labelledby="manual-c">
      <h2 id="manual-c">수동 입력 · 거래처 주문서</h2>
      <div className="actions" style={{ alignItems: "center", margin: "8px 0 12px" }}>
        <label>
          거래처{" "}
          <input value={client} placeholder="예: ○○식당" onChange={(e) => setClient(e.target.value)} />
        </label>
        <span className="caption">아래 표에 수량만 채우고 「이 거래처 주문 넣기」를 누릅니다.</span>
      </div>
      <div className="sheet" style={{ maxWidth: 520 }}>
        <table className="worksheet">
          <tbody>
            {CATALOG.flatMap((c) =>
              c.sizes.map((s, i) => {
                const key = `${c.product}|${s}`;
                return (
                  <tr key={key} className={i === 0 ? "group-start" : undefined}>
                    <th scope="row" className="name">
                      {i === 0 ? c.product : ""}
                    </th>
                    <td className="size">{s}</td>
                    <td className="num">
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setDraft({ ...draft, [key]: Math.max(0, (draft[key] || 0) - 1) })}
                      >
                        −
                      </button>
                      <strong style={{ display: "inline-block", minWidth: 28, textAlign: "center" }}>
                        {draft[key] || 0}
                      </strong>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setDraft({ ...draft, [key]: (draft[key] || 0) + 1 })}
                      >
                        +
                      </button>
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      <div className="actions" style={{ marginTop: 12 }}>
        <button type="button" className="primary-button" style={{ marginTop: 0 }} onClick={commit}>
          이 거래처 주문 넣기
        </button>
      </div>
      {clients.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>넣은 거래처</h3>
          {clients.map((name) => (
            <p key={name} style={{ margin: "0 0 6px" }}>
              <strong>{name}</strong>:{" "}
              {lines
                .filter((l) => (l.memo || "(메모 없음)") === name)
                .map((l) => `${l.product} ${l.size}×${l.qty}`)
                .join(", ")}{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => setLines(lines.filter((l) => (l.memo || "(메모 없음)") !== name))}
              >
                이 거래처 지우기
              </button>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- 시안 전환 막대 ---------- */
function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
}
const readVariant = () =>
  new URLSearchParams(window.location.search).get("variant")?.toUpperCase() ?? "A";
const isPrototypeHost = () => window.location.hostname !== "meat-daily-aggregator.vercel.app";

function setVariant(key: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", key);
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function ManualEntryPrototype() {
  const variant = useSyncExternalStore(subscribe, readVariant, () => "A");
  const visible = useSyncExternalStore(subscribe, isPrototypeHost, () => false);
  const [lines, setLines] = useState<Line[]>(() => [
    newLine("육회", "1kg", 2, "○○식당"),
    newLine("육사시미", "2kg", 1, "○○식당"),
  ]);
  if (!visible) return null;

  const index = Math.max(0, VARIANTS.findIndex((v) => v.key === variant));
  const current = VARIANTS[index];
  const step = (d: number) => setVariant(VARIANTS[(index + d + VARIANTS.length) % VARIANTS.length].key);

  const totals = new Map<string, number>();
  for (const l of lines) totals.set(`${l.product} ${l.size}`, (totals.get(`${l.product} ${l.size}`) || 0) + l.qty);

  return (
    <>
      {current.key === "A" && <VariantA lines={lines} setLines={setLines} />}
      {current.key === "B" && <VariantB lines={lines} setLines={setLines} />}
      {current.key === "C" && <VariantC lines={lines} setLines={setLines} />}

      <pre className="note" style={{ background: "#fff", padding: 12, borderRadius: 10, border: "1px dashed #c9d0db" }}>
        {`[시안 상태] 수동 줄 ${lines.length}개 → 결과표 "수동" 열에 들어갈 합계:\n` +
          [...totals.entries()].map(([k, q]) => `  ${k}: ${q}`).join("\n")}
      </pre>

      <div
        role="toolbar"
        aria-label="시안 전환"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") step(-1);
          if (e.key === "ArrowRight") step(1);
        }}
        style={{
          position: "fixed",
          left: "50%",
          bottom: 20,
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 14px",
          borderRadius: 999,
          background: "#111827",
          color: "#fff",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          zIndex: 50,
          fontWeight: 700,
        }}
      >
        <button type="button" onClick={() => step(-1)} style={{ background: "none", border: 0, color: "#fff", fontSize: 18, cursor: "pointer" }} aria-label="이전 시안">
          ←
        </button>
        <span>
          시안 {current.key} ({current.name})
        </span>
        <button type="button" onClick={() => step(1)} style={{ background: "none", border: 0, color: "#fff", fontSize: 18, cursor: "pointer" }} aria-label="다음 시안">
          →
        </button>
      </div>
    </>
  );
}
