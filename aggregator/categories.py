"""품목 카테고리와 집계 단위 정의."""

from __future__ import annotations

from dataclasses import dataclass, field


# 집계에서 제외할 부자재 키워드
EXCLUDE_KEYWORDS = (
    "소스",
    "고추장",
    "참기름",
    "와사비",
    "겨자",
    "초장",
    "쌈장",
    "양념",
    "기름",
    "아이스팩",
    "아이스 팩",
    "드라이아이스",
    "포장재",
    "포장",
    "계란",
    "달걀",
    "소금",
    "후추",
    "마늘",
    "대파",
    "김가루",
    "깨",
    "참깨",
)

# 육사시미 팩 용량(g)
YUKASHIMI_SIZES = (200, 250, 300, 400, 500, 600)

# 육회 팩 용량(g). 1000g == 1kg
YUKHOE_SIZES = (200, 230, 300, 400, 600, 1000)


@dataclass(frozen=True)
class ProductSpec:
    """인식할 고기 품목."""

    canonical: str
    aliases: tuple[str, ...]
    mode: str  # "pack_g" | "unit_g"
    pack_sizes: tuple[int, ...] = ()
    unit_g: int = 1000


PRODUCTS: tuple[ProductSpec, ...] = (
    ProductSpec("육사시미", ("육사시미", "육 사시미"), "pack_g", pack_sizes=YUKASHIMI_SIZES),
    ProductSpec("육회", ("육회",), "pack_g", pack_sizes=YUKHOE_SIZES),
    ProductSpec("소불고기", ("소불고기",), "unit_g", unit_g=500),
    ProductSpec("한돈 잡육", ("한돈 잡육", "한돈잡육"), "unit_g", unit_g=500),
    ProductSpec(
        "소고기 잡육",
        ("소고기 잡육", "소고기잡육"),
        "unit_g",
        unit_g=1000,
    ),
    ProductSpec("소갈비", ("소갈비", "갈비"), "unit_g", unit_g=1000),
    ProductSpec("배필", ("배필", "배 필"), "unit_g", unit_g=1000),
    ProductSpec("사태", ("사태",), "unit_g", unit_g=1000),
    ProductSpec("스지", ("스지",), "unit_g", unit_g=1000),
)


# 별칭 길이 내림차순 — 긴 이름을 먼저 매칭
_ALIAS_INDEX: list[tuple[str, ProductSpec]] = []
for spec in PRODUCTS:
    for alias in spec.aliases:
        _ALIAS_INDEX.append((alias.replace(" ", "").lower(), spec))
_ALIAS_INDEX.sort(key=lambda item: len(item[0]), reverse=True)


def find_product(text: str) -> ProductSpec | None:
    compact = text.replace(" ", "").lower()
    for alias, spec in _ALIAS_INDEX:
        if alias in compact:
            return spec
    return None


def is_excluded(text: str) -> bool:
    compact = text.replace(" ", "")
    return any(keyword.replace(" ", "") in compact for keyword in EXCLUDE_KEYWORDS)


@dataclass
class PackRow:
    grams: int
    packs: int = 0

    @property
    def total_g(self) -> int:
        return self.grams * self.packs


@dataclass
class DailyTotals:
    yukashimi: dict[int, int] = field(default_factory=lambda: {s: 0 for s in YUKASHIMI_SIZES})
    yukhoe: dict[int, int] = field(default_factory=lambda: {s: 0 for s in YUKHOE_SIZES})
    baepil_kg: float = 0.0
    satae_kg: float = 0.0
    galbi_kg: float = 0.0
    japuk_kg: float = 0.0
    handon_japuk_500g: float = 0.0
    bulgogi_500g: float = 0.0
    suji_kg: float = 0.0
    extra_packs: list[tuple[str, int, int]] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    unmatched: list[str] = field(default_factory=list)

    def add_pack(self, name: str, grams: int, packs: int) -> None:
        if packs <= 0:
            return
        if name == "육사시미" and grams in self.yukashimi:
            self.yukashimi[grams] += packs
        elif name == "육회" and grams in self.yukhoe:
            self.yukhoe[grams] += packs
        else:
            self.extra_packs.append((name, grams, packs))

    def add_units(self, name: str, units: float) -> None:
        if units <= 0:
            return
        mapping = {
            "배필": "baepil_kg",
            "사태": "satae_kg",
            "소갈비": "galbi_kg",
            "소고기 잡육": "japuk_kg",
            "한돈 잡육": "handon_japuk_500g",
            "소불고기": "bulgogi_500g",
            "스지": "suji_kg",
        }
        attr = mapping.get(name)
        if attr:
            setattr(self, attr, getattr(self, attr) + units)
        else:
            self.unmatched.append(f"{name} {units}")

    def merge(self, other: "DailyTotals") -> None:
        for grams, qty in other.yukashimi.items():
            self.yukashimi[grams] = self.yukashimi.get(grams, 0) + qty
        for grams, qty in other.yukhoe.items():
            self.yukhoe[grams] = self.yukhoe.get(grams, 0) + qty
        self.baepil_kg += other.baepil_kg
        self.satae_kg += other.satae_kg
        self.galbi_kg += other.galbi_kg
        self.japuk_kg += other.japuk_kg
        self.handon_japuk_500g += other.handon_japuk_500g
        self.bulgogi_500g += other.bulgogi_500g
        self.suji_kg += other.suji_kg
        self.extra_packs.extend(other.extra_packs)
        self.skipped.extend(other.skipped)
        self.unmatched.extend(other.unmatched)
