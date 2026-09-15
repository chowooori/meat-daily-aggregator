"""당일 업로드 원본과 집계표 저장."""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path

from aggregator.batches import detect_round


def desktop_dir() -> Path:
    home = Path(os.environ.get("USERPROFILE", str(Path.home())))
    for candidate in (
        home / "Desktop",
        home / "OneDrive" / "Desktop",
        home / "OneDrive" / "바탕 화면",
        home / "바탕 화면",
    ):
        if candidate.is_dir():
            return candidate
    return home / "Desktop"


DATA_DIR = desktop_dir() / "일일생산집계"


def source_name_and_bytes(source) -> tuple[str, bytes]:
    name = Path(str(getattr(source, "name", source))).name
    if hasattr(source, "getvalue"):
        return name, source.getvalue()
    return name, Path(source).read_bytes()


def save_daily_aggregate(
    sources: list,
    report_xlsx: bytes,
    report_date: date,
    data_root: Path | None = None,
) -> Path:
    folder = (data_root or DATA_DIR) / report_date.strftime("%Y-%m-%d")
    folder.mkdir(parents=True, exist_ok=True)
    for index, source in enumerate(sources, start=1):
        name, payload = source_name_and_bytes(source)
        round_no = detect_round(name, fallback=index)
        dest = folder / f"{round_no}차_{name}"
        dest.write_bytes(payload)
    report_path = folder / f"일일생산집계표_{report_date.strftime('%Y%m%d')}.xlsx"
    report_path.write_bytes(report_xlsx)
    return folder


def save_kakao_png(
    png_bytes: bytes,
    report_date: date,
    rounds: list[int] | None = None,
    data_root: Path | None = None,
) -> Path:
    folder = (data_root or DATA_DIR) / report_date.strftime("%Y-%m-%d")
    folder.mkdir(parents=True, exist_ok=True)
    round_part = ""
    if rounds:
        round_part = "_" + "-".join(str(r) for r in rounds) + "차"
    path = folder / f"카카오공유_{report_date.strftime('%Y%m%d')}{round_part}.png"
    path.write_bytes(png_bytes)
    return path
