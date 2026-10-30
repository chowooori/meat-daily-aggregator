"use client";

import { useId, useState } from "react";
import { detectRound } from "@/lib/aggregator/batches";

export const ROUND_CHOICES = [1, 2, 3] as const;

/** 올린 엑셀 파일 하나와 그 파일이 속한 차수. */
export type Upload = {
  file: File;
  round: number;
};

/** 같은 파일을 같은 차수로 저장했는지 가리기 위한 열쇠. 파일 내용이나 차수가 바뀌면 달라집니다. */
export function uploadKey(u: Upload): string {
  return `${u.file.name}|${u.file.size}|${u.file.lastModified}|${u.round}`;
}

function defaultRound(name: string, taken: number[]): number {
  const detected = detectRound(name, 0);
  if (ROUND_CHOICES.includes(detected as 1 | 2 | 3)) return detected;
  return ROUND_CHOICES.find((r) => !taken.includes(r)) ?? 1;
}

export function FileDropMulti({
  uploads,
  onUploads,
}: {
  uploads: Upload[];
  onUploads: (uploads: Upload[]) => void;
}) {
  const inputId = useId();
  const [over, setOver] = useState(false);

  const mergeFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming).filter((f) => /\.xlsx?$/i.test(f.name));
    if (!list.length) return;
    const next = uploads.filter((u) => !list.some((f) => f.name === u.file.name));
    for (const file of list) {
      const previous = uploads.find((u) => u.file.name === file.name);
      const round =
        previous?.round ?? defaultRound(file.name, next.map((u) => u.round));
      next.push({ file, round });
    }
    onUploads(next);
  };

  const setRound = (name: string, round: number) =>
    onUploads(
      uploads.map((u) => (u.file.name === name ? { ...u, round } : u)),
    );

  const remove = (name: string) =>
    onUploads(uploads.filter((u) => u.file.name !== name));

  return (
    <div>
      <label
        className={`dropzone${over ? " over" : ""}`}
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          mergeFiles(event.dataTransfer.files);
        }}
      >
        <strong>발송 엑셀 파일</strong>
        <p className="hint" style={{ marginTop: 8 }}>
          드래그 앤 드롭 또는 파일 선택 · .xls / .xlsx · 여러 파일 가능
        </p>
        <span className="file-button" style={{ marginTop: 12 }}>
          + 엑셀 선택
        </span>
        <input
          id={inputId}
          type="file"
          multiple
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            if (event.target.files) mergeFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>

      {uploads.length ? (
        <ul className="upload-list" aria-label="올린 파일과 차수">
          {uploads.map((u) => (
            <li key={u.file.name}>
              <span className="upload-name">{u.file.name}</span>
              <select
                aria-label={`${u.file.name} 차수`}
                value={u.round}
                onChange={(event) => setRound(u.file.name, Number(event.target.value))}
              >
                {ROUND_CHOICES.map((r) => (
                  <option key={r} value={r}>
                    {r}차
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="link-button"
                onClick={() => remove(u.file.name)}
                aria-label={`${u.file.name} 빼기`}
              >
                빼기
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="file-name">아직 선택한 파일이 없습니다.</p>
      )}
    </div>
  );
}
