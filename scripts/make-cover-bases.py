#!/usr/bin/env python3
"""Die Grundbilder für die Beitragskacheln erzeugen.

Pro Kategorie entsteht eine Datei unter assets/cover/. Sie enthält alles ausser
dem Text: Farbverlauf, Lichtschein, blasses Kategoriezeichen und das PSNG-Logo.
Den Text schreibt Hugo beim Bauen darüber – siehe
layouts/partials/post-og-image.html.

Das Skript läuft nur, wenn sich das Aussehen ändert (Farben, Logo, Zeichen).
Die erzeugten Dateien gehören ins Git; die Website braucht dieses Skript nicht.

    python3 scripts/make-cover-bases.py

Braucht: Pillow, numpy und eine Emoji-Schrift (Noto Color Emoji). Fehlt die
Schrift, entstehen die Bilder ohne Kategoriezeichen.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "cover"
LOGO = ROOT / "static" / "images" / "logo.webp"

W, H = 1200, 750

# Farbwelt je Kategorie – abgeleitet aus assets/scss/_variables.scss.
# Dieselben Werte stehen in layouts/partials/post-cover.html für die HTML-Karte.
THEMES = {
    "buch":        {"icon": "📖", "from": "#570030", "to": "#26010F", "accent": "#D98CB0"},
    "paper":       {"icon": "📃", "from": "#570030", "to": "#26010F", "accent": "#D98CB0"},
    "artikel":     {"icon": "📰", "from": "#570030", "to": "#26010F", "accent": "#D98CB0"},
    "film":        {"icon": "🎬", "from": "#741B47", "to": "#2E0A1D", "accent": "#E39CC0"},
    "youtube":     {"icon": "play", "from": "#741B47", "to": "#2E0A1D", "accent": "#E39CC0"},
    "podcast":     {"icon": "🎧", "from": "#8E2A5E", "to": "#3A1027", "accent": "#F0AAD0"},
    "psng-stream": {"icon": "🎙️", "from": "#8E2A5E", "to": "#3A1027", "accent": "#F0AAD0"},
    # Ohne passende Kategorie.
    "beitrag":     {"icon": "star", "from": "#570030", "to": "#26010F", "accent": "#D98CB0"},
}

RULE_W, RULE_H = 84, 4                                # der kurze Strich unter dem Titel

GRADIENT_ANGLE = 145                                  # wie linear-gradient(145deg, …)
GLOW_CENTER, GLOW_RADIUS, GLOW_ALPHA = (1050, 110), 238, 0.16
ICON_SIZE, ICON_RIGHT, ICON_BOTTOM, ICON_ALPHA = 190, 64, 40, 0.13
BADGE_CENTER, BADGE_RADIUS, BADGE_ALPHA = (1074, 118), 74, 242
LOGO_HEIGHT = 116

EMOJI_FONTS = [
    "/usr/share/fonts/noto/NotoColorEmoji.ttf",
    "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
    "/System/Library/Fonts/Apple Color Emoji.ttc",
    "C:/Windows/Fonts/seguiemj.ttf",
]


def gradient(frm: str, to: str) -> Image.Image:
    """Linearer Farbverlauf wie im CSS: Winkel im Uhrzeigersinn ab «nach oben»."""
    a = math.radians(GRADIENT_ANGLE)
    dx, dy = math.sin(a), -math.cos(a)                # Bildkoordinaten, y nach unten
    length = abs(W * dx) + abs(H * dy)

    xs = np.arange(W) - W / 2
    ys = np.arange(H) - H / 2
    t = (xs[None, :] * dx + ys[:, None] * dy) / length + 0.5
    t = np.clip(t, 0, 1)[:, :, None]

    c0 = np.array([int(frm[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)
    c1 = np.array([int(to[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)
    return Image.fromarray(np.uint8(np.round(c0 + (c1 - c0) * t)))


def add_glow(base: Image.Image) -> None:
    """Weicher heller Schein oben rechts."""
    cx, cy = GLOW_CENTER
    xs, ys = np.arange(W) - cx, np.arange(H) - cy
    r = np.hypot(xs[None, :], ys[:, None])
    alpha = np.clip(1 - r / GLOW_RADIUS, 0, 1) * GLOW_ALPHA

    arr = np.asarray(base, dtype=float)
    arr += (255 - arr) * alpha[:, :, None]
    base.paste(Image.fromarray(np.uint8(np.round(arr))))


def emoji_font() -> ImageFont.FreeTypeFont | None:
    """Noto Color Emoji liegt als Bitmap in fester Grösse vor – erst laden, dann skalieren."""
    for path in EMOJI_FONTS:
        if not Path(path).is_file():
            continue
        for size in (109, ICON_SIZE):                 # 109 = Bitmapgrösse von Noto
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return None


def draw_shape(draw: ImageDraw.ImageDraw, shape: str, cx: float, cy: float, r: float) -> None:
    """Selbst gezeichnete Zeichen.

    ✦ führt keine Emoji-Schrift, und ▶️ kommt als roter Kasten – beide passen so
    nicht zu den übrigen, zurückhaltenden Zeichen.
    """
    white = (255, 255, 255, 255)
    if shape == "star":
        inner = r * 0.26
        points = [(cx + (r if i % 2 == 0 else inner) * math.sin(math.radians(45 * i)),
                   cy - (r if i % 2 == 0 else inner) * math.cos(math.radians(45 * i)))
                  for i in range(8)]
        draw.polygon(points, fill=white)
    elif shape == "play":
        points = [(cx + r * math.sin(math.radians(90 + 120 * i)),
                   cy - r * math.cos(math.radians(90 + 120 * i))) for i in range(3)]
        draw.polygon(points, fill=white)


def add_icon(base: Image.Image, char: str, font: ImageFont.FreeTypeFont | None) -> bool:
    """Blasses Kategoriezeichen unten rechts."""
    layer = Image.new("RGBA", (ICON_SIZE * 4, ICON_SIZE * 4), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    if char in ("star", "play"):
        draw_shape(draw, char, ICON_SIZE * 2, ICON_SIZE * 2, ICON_SIZE * 1.6)
    elif font is None:
        return False
    else:
        try:
            draw.text((ICON_SIZE * 2, ICON_SIZE * 2), char, font=font, anchor="mm",
                      embedded_color=True, fill=(255, 255, 255, 255))
        except Exception:                             # noqa: BLE001
            return False

    box = layer.getbbox()
    if box is None:
        return False
    icon = layer.crop(box)
    scale = ICON_SIZE / max(icon.width, icon.height)
    icon = icon.resize((max(1, round(icon.width * scale)), max(1, round(icon.height * scale))),
                       Image.LANCZOS)
    icon.putalpha(icon.getchannel("A").point(lambda v: round(v * ICON_ALPHA)))
    base.paste(icon, (W - ICON_RIGHT - icon.width, H - ICON_BOTTOM - icon.height), icon)
    return True


def add_logo(base: Image.Image) -> bool:
    """Helle runde Fläche mit dem Logo – die feine dunkle Ringschrift braucht hellen Grund."""
    cx, cy = BADGE_CENTER
    badge = Image.new("RGBA", (BADGE_RADIUS * 4, BADGE_RADIUS * 4), (0, 0, 0, 0))
    ImageDraw.Draw(badge).ellipse(
        (0, 0, BADGE_RADIUS * 4 - 1, BADGE_RADIUS * 4 - 1), fill=(255, 255, 255, BADGE_ALPHA))
    badge = badge.resize((BADGE_RADIUS * 2, BADGE_RADIUS * 2), Image.LANCZOS)
    base.paste(badge, (cx - BADGE_RADIUS, cy - BADGE_RADIUS), badge)

    if not LOGO.is_file():
        return False
    with Image.open(LOGO) as src:
        logo = src.convert("RGBA")
    logo = logo.resize((round(logo.width * LOGO_HEIGHT / logo.height), LOGO_HEIGHT), Image.LANCZOS)
    base.paste(logo, (cx - logo.width // 2, cy - logo.height // 2), logo)
    return True


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    font = emoji_font()
    if font is None:
        print("! keine Emoji-Schrift gefunden – die Kacheln entstehen ohne Kategoriezeichen")
    if not LOGO.is_file():
        print(f"! {LOGO.relative_to(ROOT)} fehlt – die Kacheln entstehen ohne Logo")

    for name, theme in THEMES.items():
        base = gradient(theme["from"], theme["to"])
        add_glow(base)
        icon_ok = add_icon(base, theme["icon"], font)
        add_logo(base)

        dest = OUT / f"base-{name}.png"
        base.save(dest, "PNG", optimize=True)
        note = "" if icon_ok else "  (ohne Zeichen)"
        print(f"  {dest.relative_to(ROOT)}  {dest.stat().st_size // 1024} kB{note}")

        # Hugo kann nur Text schreiben und Bilder überlagern, keine Flächen
        # zeichnen – der Strich unter dem Titel kommt deshalb als eigene Datei.
        rule = Image.new("RGBA", (RULE_W * 4, RULE_H * 4), (0, 0, 0, 0))
        accent = tuple(int(theme["accent"][i:i + 2], 16) for i in (1, 3, 5)) + (255,)
        ImageDraw.Draw(rule).rounded_rectangle(
            (0, 0, RULE_W * 4 - 1, RULE_H * 4 - 1), radius=RULE_H * 2, fill=accent)
        rule.resize((RULE_W, RULE_H), Image.LANCZOS).save(OUT / f"rule-{name}.png", "PNG", optimize=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
