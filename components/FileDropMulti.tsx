"use client";

import { useId, useState } from "react";

export function FileDropMulti({
  files,
  onFiles,
}: {
  files: File[];
  onFiles: (files: File[]) => void;
}) {
  const inputId = useId();
  const [over, setOver] = useState(false);

  const mergeFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming).filter((f) =>
      /\.xlsx?$/i.test(f.name),
    );
    if (!list.length) return;
    const byName = new Map(files.map((f) => [f.name, f]));
    for (const f of list) byName.set(f.name, f);
    onFiles(Array.from(byName.values()));
  };

  return (
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
      {files.length ? (
        <ul className="file-list">
          {files.map((f) => (
            <li key={f.name}>{f.name}</li>
          ))}
        </ul>
      ) : (
        <p className="file-name">아직 선택한 파일이 없습니다.</p>
      )}
    </label>
  );
}
