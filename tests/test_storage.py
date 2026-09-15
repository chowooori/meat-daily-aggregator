from datetime import date
from pathlib import Path

from aggregator.image_export import render_share_png
from aggregator.storage import desktop_dir, save_daily_aggregate, save_kakao_png

def test_desktop_dir_points_at_desktop():
    desktop = desktop_dir()
    assert desktop.name in {"Desktop", "바탕 화면"}
    assert desktop.parent.exists()


def test_save_daily_aggregate(tmp_path: Path):
    src = tmp_path / "in"
    src.mkdir()
    f1 = src / "EMP 01.xls"
    f2 = src / "EMP 02.xls"
    f1.write_bytes(b"one")
    f2.write_bytes(b"two")
    folder = save_daily_aggregate(
        [f1, f2],
        b"xlsx",
        date(2026, 9, 15),
        data_root=tmp_path / "data",
    )
    assert folder.name == "2026-09-15"
    assert (folder / "1차_EMP 01.xls").read_bytes() == b"one"
    assert (folder / "2차_EMP 02.xls").read_bytes() == b"two"
    assert (folder / "일일생산집계표_20260915.xlsx").read_bytes() == b"xlsx"


def test_save_kakao_png(tmp_path: Path):
    png = render_share_png(
        [{"상품": "육회 300g", "용량": "300g", "1차": 4, "합계": 4}],
        [{"품목": "육회", "단위": "kg", "1차": 1.2, "합계": 1.2}],
        [1],
        date(2026, 9, 15),
    )
    assert png.startswith(b"\x89PNG")
    path = save_kakao_png(png, date(2026, 9, 15), [1, 2, 3], data_root=tmp_path / "data")
    assert path.name == "카카오공유_20260915_1-2-3차.png"
    assert path.read_bytes().startswith(b"\x89PNG")
