"use client";

import { useState } from "react";
import type { WatchBusiness } from "@/lib/aggregator/watchBusinesses";
import { postWatchBusinesses } from "@/lib/supabase/saveProduction";

/** 확인 업체 관리: 업체 이름과 요구사항을 직접 추가·수정·삭제하고 저장합니다. 모든 PC에서 같은 목록을 씁니다. */
export function WatchBusinessManager({
  businesses,
  onSaved,
}: {
  businesses: WatchBusiness[];
  onSaved: (businesses: WatchBusiness[]) => void;
}) {
  const [draft, setDraft] = useState<WatchBusiness[] | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const list = draft ?? businesses;
  const dirty = draft !== null;

  const resetForm = () => {
    setName("");
    setNote("");
    setEditingIndex(null);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const duplicate = list.some(
      (b, idx) => idx !== editingIndex && b.name.replace(/\s+/g, "") === trimmed.replace(/\s+/g, ""),
    );
    if (duplicate) {
      setMessage(`"${trimmed}"은(는) 이미 목록에 있습니다.`);
      return;
    }
    const item = { name: trimmed, note: note.trim() };
    setDraft(
      editingIndex === null
        ? [...list, item]
        : list.map((b, idx) => (idx === editingIndex ? item : b)),
    );
    setMessage("");
    resetForm();
  };

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setMessage("");
    const saved = await postWatchBusinesses(list);
    setSaving(false);
    if (saved.ok) {
      onSaved(saved.businesses);
      setDraft(null);
      setMessage("확인 업체 목록을 저장했습니다. 다음에 올리는 엑셀부터 바로 적용됩니다.");
    } else {
      setMessage(`저장하지 못했습니다. ${saved.error}`);
    }
  };

  return (
    <details className="card watch-manager">
      <summary>
        <h2>확인 업체 관리</h2>
        <span className="caption">{list.length}곳</span>
      </summary>
      <p className="hint" style={{ margin: "8px 0 12px" }}>
        엑셀의 배송지주소·수령자명이나 식당 주문의 식당 이름에 업체 이름이 들어 있으면 결과 위 안내와
        카카오 이미지 &quot;주의 사항&quot;에 알려 줍니다. 요구사항은 안내 문구 끝에 붙습니다.
      </p>

      <form
        className="manual-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label>
          <span className="sr-only">업체 이름</span>
          <input value={name} placeholder="업체 이름 (예: 육회챱챱)" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="manual-memo">
          <span className="sr-only">요구사항</span>
          <input value={note} placeholder="요구사항 (예: 200g 소분포장)" onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="submit" className="primary-button" style={{ marginTop: 0 }} disabled={!name.trim()}>
          {editingIndex === null ? "추가" : "고치기"}
        </button>
        {editingIndex !== null && (
          <button type="button" className="ghost-button" onClick={resetForm}>
            취소
          </button>
        )}
      </form>

      {list.length ? (
        <ul className="upload-list" aria-label="확인 업체 목록" style={{ marginTop: 12 }}>
          {list.map((b, idx) => (
            <li key={`${b.name}-${idx}`} className={idx === editingIndex ? "is-editing" : undefined}>
              <button
                type="button"
                className="manual-line"
                onClick={() => {
                  setName(b.name);
                  setNote(b.note);
                  setEditingIndex(idx);
                }}
                aria-label={`${b.name} 고치기`}
              >
                <strong>{b.name}</strong>
                {b.note ? <span className="caption"> · {b.note}</span> : null}
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setDraft(list.filter((_, i) => i !== idx));
                  if (editingIndex === idx) resetForm();
                }}
              >
                지우기
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="file-name">등록한 확인 업체가 없습니다.</p>
      )}

      <div className="actions" style={{ marginTop: 12, alignItems: "center" }}>
        <button type="button" className="ghost-button" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? "저장 중…" : dirty ? "업체 목록 저장" : "저장됨"}
        </button>
        {dirty && (
          <button type="button" className="link-button" onClick={() => setDraft(null)}>
            바꾼 내용 되돌리기
          </button>
        )}
        <span className="caption" aria-live="polite">
          {message}
        </span>
      </div>
    </details>
  );
}
