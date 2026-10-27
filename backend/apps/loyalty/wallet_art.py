"""
The strip across the Wallet coffee card: the stamps as the app shows them, two rows of five
slots, the tenth being the free coffee. Drawn for every pass version so it always matches the
header. iPhone shows a store card strip at 375x144 points; the pass carries 1x/2x/3x copies.
"""

import io
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT = Path(__file__).resolve().parent / "wallet_assets" / "fonts" / "Figtree_600SemiBold.ttf"

ESPRESSO = (75, 46, 38)
ESPRESSO_TOP = (84, 52, 43)
ESPRESSO_DEEP = (66, 40, 33)
SAND = (214, 180, 140)
CREAM = (247, 240, 228)
RING = tuple(round(c * 0.35 + e * 0.65) for c, e in zip(CREAM, ESPRESSO_DEEP, strict=True))

STRIP = (375, 144)
SUPERSAMPLE = 3
PER_ROW = 5


@lru_cache(maxsize=4)
def _font(size):
    return ImageFont.truetype(str(FONT), size)


def _background(width, height):
    column = Image.new("RGB", (1, height))
    for y in range(height):
        t = y / max(1, height - 1)
        column.putpixel(
            (0, y),
            tuple(round(a + (b - a) * t) for a, b in zip(ESPRESSO_TOP, ESPRESSO_DEEP, strict=True)),
        )
    return column.resize((width, height))


def _cup(draw, x, y, d, ink):
    """A small coffee cup inside a stamp of diameter d at (x, y)."""
    w = d * 0.40
    h = d * 0.30
    left = x + (d - w) / 2 - d * 0.04
    top = y + d * 0.36
    line = max(2, round(d * 0.06))
    draw.rounded_rectangle((left, top, left + w, top + h), radius=d * 0.09, fill=ink)
    handle = d * 0.15
    draw.ellipse(
        (
            left + w - handle * 0.35,
            top + h * 0.18,
            left + w + handle * 0.75,
            top + h * 0.18 + handle,
        ),
        outline=ink,
        width=line,
    )
    draw.rounded_rectangle(
        (left - d * 0.07, top + h + d * 0.05, left + w + d * 0.07, top + h + d * 0.05 + line),
        radius=line / 2,
        fill=ink,
    )
    for i in (0.3, 0.62):
        sx = left + w * i
        draw.arc(
            (sx - d * 0.05, top - d * 0.17, sx + d * 0.05, top - d * 0.03),
            100,
            260,
            fill=ink,
            width=line,
        )


def strip_image(stamps, per_reward, scale):
    slots = per_reward + 1  # the last slot is the free coffee
    stamps = max(0, min(stamps, per_reward))
    k = scale * SUPERSAMPLE
    width, height = STRIP[0] * k, STRIP[1] * k
    image = _background(width, height).convert("RGBA")
    draw = ImageDraw.Draw(image)

    rows = [min(PER_ROW, slots - r * PER_ROW) for r in range((slots + PER_ROW - 1) // PER_ROW)]
    gap, row_gap = 14 * k, 10 * k
    diameter = int(
        min(
            (width - 2 * 30 * k - (PER_ROW - 1) * gap) / PER_ROW,
            (height - 2 * 16 * k - (len(rows) - 1) * row_gap) / len(rows),
        )
    )
    top = (height - (len(rows) * diameter + (len(rows) - 1) * row_gap)) // 2
    ring = max(2, diameter // 22)
    font = _font(max(8, int(diameter * 0.26)))
    index = 0
    for row, count in enumerate(rows):
        left = (width - (count * diameter + (count - 1) * gap)) // 2
        y = top + row * (diameter + row_gap)
        for column in range(count):
            index += 1
            x = left + column * (diameter + gap)
            box = (x, y, x + diameter, y + diameter)
            centre = (x + diameter / 2, y + diameter / 2)
            if index == slots:
                full = stamps >= per_reward
                draw.ellipse(box, fill=SAND if full else ESPRESSO_DEEP, outline=SAND, width=ring)
                draw.text(centre, "FREE", font=font, fill=ESPRESSO if full else SAND, anchor="mm")
            elif index <= stamps:
                draw.ellipse(box, fill=SAND)
                _cup(draw, x, y, diameter, ESPRESSO)
            else:
                draw.ellipse(box, fill=ESPRESSO_DEEP, outline=RING, width=ring)
    return image.resize((STRIP[0] * scale, STRIP[1] * scale), Image.LANCZOS).convert("RGB")


def strips(stamps, per_reward):
    """strip.png / strip@2x.png / strip@3x.png for this many stamps."""
    files = {}
    for scale, name in ((1, "strip.png"), (2, "strip@2x.png"), (3, "strip@3x.png")):
        buffer = io.BytesIO()
        strip_image(stamps, per_reward, scale).save(buffer, format="PNG", optimize=True)
        files[name] = buffer.getvalue()
    return files
