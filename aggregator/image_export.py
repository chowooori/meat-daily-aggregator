"""카카오 공유용 수량표 PNG."""

from __future__ import annotations

from datetime import date
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from aggregator.batches import round_label

NAVY = (31, 78, 121)
GOLD = (255, 242, 204)
GREEN = (226, 239, 218)
WHITE = (255, 255, 255)
GRAY = (247, 247, 247)
TEXT = (33, 37, 41)
MUTED = (90, 98, 104)


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    bundled = Path(__file__).resolve().parent.parent / "fonts" / "NanumGothic-Regular.ttf"
    candidates = [bundled]
    if bold:
        candidates.extend(
            [
                Path(r"C:\Windows\Fonts\malgunbd.ttf"),
                Path("/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"),
            ]
        )
    candidates.extend(
        [
            Path(r"C:\Windows\Fonts\malgun.ttf"),
            Path("/usr/share/fonts/truetype/nanum/NanumGothic.ttf"),
            Path("/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"),
            Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        ]
    )
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def _fmt(value) -> str:
    if value is None or value == "":
        return "0"
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return f"{value:.2f}".rstrip("0").rstrip(".")
    return str(value)


def _cell_text(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, font, fill, *, align="center"):
    x0, y0, x1, y1 = box
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    if align == "left":
        x = x0 + 16
    else:
        x = x0 + (x1 - x0 - tw) / 2
    y = y0 + (y1 - y0 - th) / 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=fill)


def render_share_png(
    qty_rows: list[dict],
    kg_rows: list[dict],
    rounds: list[int],
    report_date: date,
) -> bytes:
    round_cols = [round_label(r) for r in rounds]
    headers = ["상품", "용량", *round_cols, "합계"]
    col_w = [280, 120] + [110] * len(round_cols) + [130]
    width = sum(col_w) + 72
    row_h = 52
    header_h = 54
    title_h = 128
    kg_title_h = 56
    footer_h = 48
    table_rows = max(len(qty_rows), 1)
    kg_rows_n = max(len(kg_rows), 1)
    height = title_h + header_h + table_rows * row_h + 28 + kg_title_h + header_h + kg_rows_n * row_h + footer_h

    img = Image.new("RGB", (width, height), WHITE)
    draw = ImageDraw.Draw(img)
    title_font = _font(36, bold=True)
    sub_font = _font(18)
    head_font = _font(18, bold=True)
    cell_font = _font(20)
    cell_bold = _font(22, bold=True)

    draw.rectangle((0, 0, width, 96), fill=NAVY)
    _cell_text(draw, (0, 8, width, 58), "오늘 만들어야 할 수량", title_font, WHITE)
    round_text = " · ".join(round_cols) if round_cols else ""
    _cell_text(
        draw,
        (0, 54, width, 92),
        f"{report_date.strftime('%Y년 %m월 %d일')}   {round_text}   카카오 공유용",
        sub_font,
        (210, 224, 237),
    )

    def draw_table(origin_y: int, cols: list[str], rows: list[dict], key_map: list[str]) -> int:
        x = 36
        y = origin_y
        xs = [x]
        for w in col_w[: len(cols)]:
            xs.append(xs[-1] + w)
        for i, title in enumerate(cols):
            draw.rectangle((xs[i], y, xs[i + 1], y + header_h), fill=NAVY)
            _cell_text(draw, (xs[i], y, xs[i + 1], y + header_h), title, head_font, WHITE)
        y += header_h
        if not rows:
            draw.rectangle((xs[0], y, xs[-1], y + row_h), fill=GRAY)
            _cell_text(draw, (xs[0], y, xs[-1], y + row_h), "집계된 수량이 없습니다", cell_font, MUTED)
            return y + row_h
        for ridx, row in enumerate(rows):
            bg = GREEN if ridx % 2 == 0 else WHITE
            draw.rectangle((xs[0], y, xs[-1], y + row_h), fill=bg)
            draw.rectangle((xs[-2], y, xs[-1], y + row_h), fill=GOLD)
            for i, key in enumerate(key_map):
                text = _fmt(row.get(key, "")) if i > 0 else str(row.get(key, ""))
                if i == 0:
                    text = str(row.get(key, ""))
                font = cell_bold if key == "합계" else cell_font
                align = "left" if i == 0 else "center"
                _cell_text(draw, (xs[i], y, xs[i + 1], y + row_h), text, font, TEXT, align=align)
            y += row_h
        draw.rectangle((xs[0], origin_y, xs[-1], y), outline=(180, 186, 192), width=1)
        return y

    qty_keys = ["상품", "용량", *round_cols, "합계"]
    y = draw_table(title_h, headers, qty_rows, qty_keys)

    y += 20
    draw.rectangle((36, y, width - 36, y + kg_title_h - 8), fill=(46, 134, 171))
    _cell_text(
        draw,
        (36, y, width - 36, y + kg_title_h - 8),
        "육회 · 육사시미 전용량 중량 (kg)",
        head_font,
        WHITE,
    )
    y += kg_title_h
    kg_headers = ["품목", "단위", *round_cols, "합계"]
    kg_keys = ["품목", "단위", *round_cols, "합계"]
    # reuse col widths: 상품->품목, 용량->단위
    y = draw_table(y, kg_headers, kg_rows, kg_keys)

    _cell_text(
        draw,
        (0, height - footer_h, width, height - 8),
        "카카오톡에 이 이미지를 전송하세요",
        sub_font,
        MUTED,
    )

    buffer = BytesIO()
    img.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
