#!/usr/bin/env python3
"""Generate the app icons from the Flow mark.

The shipped PNGs are binaries — nothing in a diff tells you whether they still
match the logo drawn inside the app. So they are generated here from the same
geometry as `src/components/Logo.tsx`, and that file is the source of truth: if
the mark changes there, change CARDS below and re-run this.

    pip install cairosvg
    python3 scripts/make-icons.py

Needs a rasterizer, which is why this is Python in a JavaScript project. It is a
one-off authoring tool, not part of the build — no npm script depends on it.
"""

from pathlib import Path

import cairosvg
from PIL import Image

INK = "#0A0A0A"  # the app's black, not pure #000
PAPER = "#FFFFFF"

# Fanned cards, back to front, in the mark's own 32x32 box. Depth comes from
# opacity alone, so the mark stays monochrome on any background.
# (x, y, w, h, corner radius, opacity)
CARDS = [
    (8.0, 5.5, 16.0, 7.0, 2.2, 0.30),
    (6.0, 9.0, 20.0, 7.0, 2.6, 0.55),
    (4.0, 12.5, 24.0, 13.5, 3.4, 1.00),
]

# What the cards actually cover inside that box — narrower and shorter than the
# box itself, so centring on the box would sit the mark high and left.
BOX = 32.0
INK_X0, INK_X1 = 4.0, 28.0
INK_Y0, INK_Y1 = 5.5, 26.0
INK_W = INK_X1 - INK_X0
CX, CY = (INK_X0 + INK_X1) / 2, (INK_Y0 + INK_Y1) / 2

OUT = Path(__file__).resolve().parent.parent / "assets" / "images"


def svg(canvas: int, mark_width: float | None, fg: str, bg: str | None) -> bytes:
    """The mark at `mark_width` px wide, centred on a `canvas` px square.

    `mark_width=None` draws the background alone, `bg=None` leaves it clear.
    """
    plate = f'<rect width="{canvas}" height="{canvas}" fill="{bg}"/>' if bg else ""
    mark = ""
    if mark_width:
        scale = mark_width / INK_W
        tx, ty = canvas / 2 - CX * scale, canvas / 2 - CY * scale
        rects = "".join(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" '
            f'fill="{fg}" opacity="{o}"/>'
            for x, y, w, h, r, o in CARDS
        )
        mark = f'<g transform="translate({tx},{ty}) scale({scale})">{rects}</g>'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{canvas}" height="{canvas}" '
        f'viewBox="0 0 {canvas} {canvas}">{plate}{mark}</svg>'
    ).encode()


def write(name: str, canvas: int, mark_width: float | None, fg: str, bg: str | None, flatten=False):
    path = OUT / name
    cairosvg.svg2png(
        bytestring=svg(canvas, mark_width, fg, bg),
        write_to=str(path),
        output_width=canvas,
        output_height=canvas,
    )
    if flatten:
        # App Store Connect rejects an app icon with an alpha channel, even a
        # fully opaque one. The plate is already solid, so this only drops the
        # channel — no pixel changes.
        Image.open(path).convert("RGB").save(path)
    im = Image.open(path)
    print(f"  {name:32} {im.size[0]}x{im.size[1]}  {im.mode}")


print("Writing to", OUT)

# iOS. Square and unrounded — iOS masks the corners itself. White on black.
write("icon.png", 1024, 560, PAPER, INK, flatten=True)

# Splash: dark on transparent, over the white background set in app.json.
write("splash-icon.png", 512, 460, INK, None)

# Web favicon, for the legal & support pages.
write("favicon.png", 64, 52, INK, None)

# Android adaptive icon. The outer third of the canvas can be cropped to any
# shape, so the mark has to stay inside the middle — hence the smaller width.
write("android-icon-background.png", 1024, None, INK, INK)
write("android-icon-foreground.png", 1024, 430, PAPER, None)
write("android-icon-monochrome.png", 1024, 430, "#000000", None)

print("Done. These are generated — edit Logo.tsx and re-run, don't hand-edit them.")
