#!/usr/bin/env python3
"""Generate the title-card PNGs in public/assets/img (three aspect ratios each).

Dev-time tool: the outputs are committed, so the site build needs neither Python nor Pillow.
    python3 scripts/make-images.py
Requires Pillow and the Inter font (or edit FONT_* to point at any bold/regular TTF/OTF).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "img"
FONT_BOLD = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
FONT_REGULAR = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"

PAPER = (237, 241, 243)
INK = (19, 34, 45)
MUTED = (74, 90, 102)
EDGE = (10, 108, 116)
HL = (255, 216, 77)
GRID = (214, 222, 227)

CARDS = {
    "site-default": ("Structured data you can inspect, test and ship.", "Pranav Gauttam"),
    "typed-json-ld-pipeline": ("Shipping JSON-LD as code: one entity graph, checked on every build", "Structured data"),
    "ai-crawler-access": ("Which AI crawlers can read your site?", "Crawlability"),
}

SIZES = {"16x9": (1200, 675), "4x3": (1200, 900), "1x1": (1200, 1200)}


def wrap(draw, text, font, max_width):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=font) <= max_width:
            line = trial
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def node(draw, x, y, w, h, label, font):
    draw.rectangle([x, y, x + w, y + h], fill=(255, 255, 255), outline=INK, width=4)
    draw.rectangle([x, y, x + 16, y + h], fill=HL, outline=INK, width=4)
    draw.text((x + 34, y + h / 2), label, font=font, fill=INK, anchor="lm")


def draw_card(title, kicker, size):
    w, h = size
    img = Image.new("RGB", size, PAPER)
    d = ImageDraw.Draw(img)
    for gx in range(0, w, 48):
        d.line([(gx, 0), (gx, h)], fill=GRID, width=1)
    for gy in range(0, h, 48):
        d.line([(0, gy), (w, gy)], fill=GRID, width=1)

    m = 72
    d.rectangle([4, 4, w - 5, h - 5], outline=INK, width=6)

    title_font = ImageFont.truetype(FONT_BOLD, 84 if w == h else 76)
    small = ImageFont.truetype(FONT_REGULAR, 34)
    label = ImageFont.truetype(FONT_BOLD, 30)

    d.rectangle([m, m, m + 20, m + 56], fill=HL, outline=INK, width=4)
    d.text((m + 44, m + 28), kicker, font=small, fill=MUTED, anchor="lm")

    lines = wrap(d, title, title_font, w - 2 * m)
    y = m + 110
    for line in lines[:5]:
        d.text((m, y), line, font=title_font, fill=INK)
        y += 90 if w == h else 84

    # A small entity graph along the bottom: three nodes joined by teal lines.
    nw, nh = 230, 74
    base = h - m - nh
    xs = [m, m + 330, m + 660]
    ys = [base, base - 10 if h > 700 else base, base]
    for (x1, y1), (x2, y2) in zip(zip(xs[:-1], ys[:-1]), zip(xs[1:], ys[1:])):
        d.line([(x1 + nw, y1 + nh / 2), (x2, y2 + nh / 2)], fill=EDGE, width=5)
        d.polygon([(x2, y2 + nh / 2), (x2 - 16, y2 + nh / 2 - 9), (x2 - 16, y2 + nh / 2 + 9)], fill=EDGE)
    for x, y, text in zip(xs, ys, ["BlogPosting", "WebPage", "Person"]):
        node(d, x, y, nw, nh, text, label)

    d.text((w - m, m + 28), "pranavgauttam08.github.io", font=small, fill=MUTED, anchor="rm")
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for base, (title, kicker) in CARDS.items():
        for ratio, size in SIZES.items():
            path = OUT / f"{base}-{ratio}.png"
            draw_card(title, kicker, size).save(path, optimize=True)
            print(f"wrote {path.relative_to(ROOT)} {size[0]}x{size[1]} {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
