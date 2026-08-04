#!/usr/bin/env python3
"""Fehlende Beitragsbilder erzeugen.

Das Skript liest alle Beiträge unter content/posts/, prüft für jeden, ob das im
Front Matter angegebene Bild wirklich existiert, und erzeugt für jedes fehlende
eine typografische Kachel: Titel, Urheber und Publikation in den Farben der
Website, je nach Kategorie eingefärbt, mit dem PSNG-Logo oben rechts.

Vorhandene Bilder werden nie überschrieben (ausser mit --force, und auch dann
nur die selbst erzeugten – siehe MARKER).

    python3 scripts/generate-post-images.py            # fehlende erzeugen
    python3 scripts/generate-post-images.py --dry-run  # nur zeigen, was fehlt
    python3 scripts/generate-post-images.py --force    # erzeugte neu bauen
    python3 scripts/generate-post-images.py --only huxley_doors

Braucht: Python 3.11+, Pillow (pip install Pillow) und Google Chrome bzw.
Chromium für das Rendern der Kacheln.
"""

from __future__ import annotations

import argparse
import html
import re
import shutil
import subprocess
import sys
import tempfile
import time
import tomllib
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / "content" / "posts"
STATIC = ROOT / "static"
FONT_CACHE = Path(__file__).resolve().parent / ".fonts"

W, H = 1200, 750

# PSNG-Logo oben rechts auf jedem erzeugten Bild
LOGO = STATIC / "images" / "logo.webp"
# Das Logo hat feine dunkle Ringschrift und verschwindet auf dunklem Grund –
# deshalb sitzt es auf einer hellen runden Fläche.
LOGO_HEIGHT, LOGO_TOP, LOGO_RIGHT = 116, 44, 52
BADGE_SIZE, BADGE_ALPHA = 148, 242                    # Durchmesser, Deckkraft 0–255

# Kennzeichen im JPEG-Kommentar: nur so markierte Bilder fasst --force wieder an,
# selbst gemachte Bilder bleiben unangetastet.
MARKER = "erzeugt von scripts/generate-post-images.py"
UA = {"User-Agent": "literature.parab.ch Bildgenerator"}

CHROME_CANDIDATES = [
    "google-chrome-stable", "google-chrome", "chromium", "chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]

# Farbwelt je Kategorie – abgeleitet aus assets/scss/_variables.scss
THEMES = {
    "buch":    {"label": "Buch",    "icon": "📖", "from": "#570030", "to": "#26010F", "accent": "#D98CB0"},
    "paper":   {"label": "Paper",   "icon": "📃", "from": "#570030", "to": "#26010F", "accent": "#D98CB0"},
    "film":    {"label": "Film",    "icon": "🎬", "from": "#741B47", "to": "#2E0A1D", "accent": "#E39CC0"},
    "podcast": {"label": "Podcast", "icon": "🎧", "from": "#8E2A5E", "to": "#3A1027", "accent": "#F0AAD0"},
}
FALLBACK_THEME = {"label": "Beitrag", "icon": "✦", "from": "#570030", "to": "#26010F", "accent": "#D98CB0"}

FONT_CSS_URL = (
    "https://fonts.googleapis.com/css2"
    "?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700&display=swap"
)


# ---------------------------------------------------------------- Beiträge lesen

def read_front_matter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end == -1:
            return {}
        import yaml  # nur für YAML-Front-Matter nötig
        return yaml.safe_load(text[3:end]) or {}
    if text.startswith("+++"):
        end = text.find("\n+++", 3)
        if end == -1:
            return {}
        return tomllib.loads(text[3:end])
    return {}


def as_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(v) for v in value]
    return [str(value)]


class Post:
    def __init__(self, index_md: Path):
        self.path = index_md
        self.dir = index_md.parent
        self.fm = read_front_matter(index_md)
        self.title = str(self.fm.get("title") or self.dir.name)
        self.author = str(self.fm.get("resource_author") or self.fm.get("author") or "")
        self.publication = str(self.fm.get("publication") or "")
        self.categories = as_list(self.fm.get("categories"))
        self.draft = bool(self.fm.get("draft"))
        raw = str(self.fm.get("image") or "").strip()
        self.image = "" if raw in ("", "/") else raw

    @property
    def slug(self) -> str:
        s = self.dir.name.lower()
        s = re.sub(r"[^a-z0-9]+", "-", s.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss"))
        return s.strip("-")

    @property
    def theme(self) -> dict:
        for c in self.categories:
            if c.strip().lower() in THEMES:
                return THEMES[c.strip().lower()]
        return FALLBACK_THEME

    def target(self) -> Path | None:
        """Wohin das Bild gehört – None, wenn es extern liegt."""
        if self.image.startswith(("http://", "https://", "//")):
            return None
        if not self.image:
            return STATIC / "images" / f"{self.slug}.jpg"
        return STATIC / self.image.lstrip("/")

    def has_image(self) -> bool:
        if self.image.startswith(("http://", "https://", "//")):
            return True
        if not self.image:
            return False
        if (self.dir / self.image.lstrip("./")).is_file():   # Bild im Beitragsordner
            return True
        return (STATIC / self.image.lstrip("/")).is_file()


def load_posts() -> list[Post]:
    return sorted((Post(p) for p in POSTS.glob("*/index.md")), key=lambda p: p.title)


# ---------------------------------------------------------------- Netz + Schrift

def fetch(url: str, attempts: int = 3, timeout: int = 20) -> bytes:
    """Kleiner Downloader mit Wiederholung – wird nur für die Schriftdateien gebraucht."""
    last: Exception | None = None
    for i in range(attempts):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
        except Exception as exc:                      # noqa: BLE001
            last = exc
            if i + 1 < attempts:
                time.sleep(min(60, 6 * (i + 1)))
    raise last                                        # type: ignore[misc]


def font_css() -> str:
    """Plus Jakarta Sans lokal vorhalten – Chrome im Headless-Modus hat oft kein Netz."""
    FONT_CACHE.mkdir(exist_ok=True)
    cached = FONT_CACHE / "fonts.css"
    if cached.is_file():
        return cached.read_text(encoding="utf-8")
    try:
        css = fetch(FONT_CSS_URL, attempts=2, timeout=20).decode("utf-8")
        for i, url in enumerate(sorted(set(re.findall(r"url\((https://[^)]+\.woff2)\)", css)))):
            dest = FONT_CACHE / f"font-{i}.woff2"
            dest.write_bytes(fetch(url, attempts=2, timeout=20))
            css = css.replace(url, dest.as_uri())
        cached.write_text(css, encoding="utf-8")
        return css
    except Exception as exc:                          # noqa: BLE001
        print(f"  ! Schrift nicht ladbar ({exc}) – es wird die Systemschrift benutzt")
        return ""


def save_jpeg(image, dest: Path, quality: int) -> None:
    """Bild speichern und als selbst erzeugt kennzeichnen."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    image.save(dest, "JPEG", quality=quality, optimize=True, progressive=True,
               comment=MARKER.encode("utf-8"))


def is_generated(path: Path) -> bool:
    """Stammt das Bild von diesem Skript? Handgemachte Bilder haben kein Kennzeichen."""
    if not path.is_file():
        return False
    try:
        from PIL import Image

        with Image.open(path) as image:
            comment = image.info.get("comment", b"")
    except Exception:                                 # noqa: BLE001
        return False
    if isinstance(comment, str):
        comment = comment.encode("utf-8", "replace")
    return MARKER.encode("utf-8") in comment


def logo_data_uri() -> str:
    """Logo als data:-URI, damit Chrome nichts nachladen muss."""
    if not LOGO.is_file():
        print(f"  ! {LOGO.relative_to(ROOT)} fehlt – Bilder entstehen ohne Logo")
        return ""
    import base64
    return "data:image/webp;base64," + base64.b64encode(LOGO.read_bytes()).decode("ascii")


def find_chrome() -> str:
    for candidate in CHROME_CANDIDATES:
        found = shutil.which(candidate) or (candidate if Path(candidate).is_file() else None)
        if found:
            return found
    sys.exit("Kein Chrome/Chromium gefunden – bitte installieren (die Kacheln werden damit gerendert).")


# ---------------------------------------------------------------- Kachel rendern

PAGE = """<!doctype html><meta charset="utf-8">
<style>{fontcss}</style>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: {W}px; height: {H}px; }}
  body {{
    background: linear-gradient(145deg, {frm} 0%, {to} 100%);
    color: #fff; font-family: 'Inter', sans-serif;
    padding: 72px 80px; display: flex; flex-direction: column; justify-content: space-between;
    position: relative; overflow: hidden;
  }}
  .glow {{ position: absolute; top: -240px; right: -200px; width: 700px; height: 700px;
           background: radial-gradient(circle, rgba(255,255,255,.16) 0%, rgba(255,255,255,0) 68%); }}
  .icon {{ position: absolute; right: 64px; bottom: 40px; font-size: 190px; opacity: .13; line-height: 1; }}
  .badge {{ position: absolute; top: {logo_top}px; right: {logo_right}px;
            width: {badge}px; height: {badge}px; border-radius: 50%;
            background: rgba(255,255,255,{badge_alpha});
            display: flex; align-items: center; justify-content: center; }}
  .badge img {{ height: {logo_height}px; }}
  .kicker {{ font-size: 22px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase;
             color: {accent}; position: relative; }}
  .title {{ font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; font-weight: 700;
            font-size: {size}px; line-height: 1.12; letter-spacing: -.015em; max-width: 940px; position: relative; }}
  .rule {{ width: 84px; height: 4px; background: {accent}; border-radius: 2px; margin: 26px 0 22px; position: relative; }}
  .meta {{ font-size: 25px; font-weight: 500; color: rgba(255,255,255,.86); position: relative; max-width: 900px; }}
  .pub {{ font-size: 20px; color: rgba(255,255,255,.6); margin-top: 8px; position: relative; max-width: 900px; }}
</style>
<div class="glow"></div>
<div class="icon">{icon}</div>
{logo}
<div class="kicker">{label}</div>
<div>
  <div class="title">{title}</div>
  <div class="rule"></div>
  {meta}
  {pub}
</div>
"""


def title_size(title: str) -> int:
    n = len(title)
    return 92 if n <= 22 else 78 if n <= 34 else 66 if n <= 48 else 58 if n <= 62 else 50


def render_tile(post: Post, dest: Path, chrome: str, fontcss: str, logo: str) -> None:
    from PIL import Image

    theme = post.theme
    page = PAGE.format(
        fontcss=fontcss, W=W, H=H, frm=theme["from"], to=theme["to"], accent=theme["accent"],
        icon=theme["icon"], label=theme["label"], size=title_size(post.title),
        logo=f'<div class="badge"><img src="{logo}"></div>' if logo else "",
        logo_top=LOGO_TOP, logo_right=LOGO_RIGHT, logo_height=LOGO_HEIGHT,
        badge=BADGE_SIZE, badge_alpha=round(BADGE_ALPHA / 255, 3),
        title=html.escape(post.title),
        meta=f'<div class="meta">{html.escape(post.author)}</div>' if post.author else "",
        pub=f'<div class="pub">{html.escape(post.publication)}</div>' if post.publication else "",
    )
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "tile.html"
        src.write_text(page, encoding="utf-8")
        png = Path(tmp) / "tile.png"
        subprocess.run(
            [chrome, "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
             f"--window-size={W},{H}", f"--screenshot={png}", src.as_uri()],
            check=True, capture_output=True, timeout=120,
        )
        dest.parent.mkdir(parents=True, exist_ok=True)
        save_jpeg(Image.open(png).convert("RGB"), dest, quality=90)


# ---------------------------------------------------------------- Hauptprogramm

def main() -> int:
    parser = argparse.ArgumentParser(description="Fehlende Beitragsbilder erzeugen.")
    parser.add_argument("--dry-run", action="store_true", help="nur auflisten, nichts schreiben")
    parser.add_argument("--force", action="store_true",
                        help="auch die schon erzeugten Bilder neu erzeugen (selbst gemachte bleiben)")
    parser.add_argument("--only", metavar="TEXT", help="nur Beiträge, deren Titel oder Bildname TEXT enthält")
    parser.add_argument("--drafts", action="store_true", help="Entwürfe mitnehmen (sonst übersprungen)")
    args = parser.parse_args()

    posts = [p for p in load_posts() if args.drafts or not p.draft]

    def wanted(post: Post) -> bool:
        if post.target() is None:                     # externes Bild – nicht unsere Sache
            return False
        if not post.has_image():
            return True
        return args.force and is_generated(post.target())

    todo = [p for p in posts if wanted(p)]
    if args.only:
        needle = args.only.lower()
        todo = [p for p in todo if needle in p.title.lower() or needle in p.image.lower()]

    # Mehrere Beiträge dürfen sich dasselbe Bild teilen – dann nur einmal erzeugen.
    seen: set[Path] = set()
    todo = [p for p in todo if not (p.target() in seen or seen.add(p.target()))]  # type: ignore[func-returns-value]

    print(f"{len(posts)} Beiträge, {len(todo)} ohne Bild\n")
    if not todo:
        print("Nichts zu tun.")
        return 0

    for post in todo:
        target = post.target()
        assert target is not None
        print(f"  {post.title}\n      -> {target.relative_to(ROOT)}  [{post.theme['label']}]")
    if args.dry_run:
        print("\n--dry-run: nichts geschrieben.")
        return 0

    chrome, css, logo = find_chrome(), font_css(), logo_data_uri()
    print()

    tiles = 0
    missing_front_matter: list[Post] = []
    for post in todo:
        target = post.target()
        assert target is not None
        if not post.image:
            missing_front_matter.append(post)
        render_tile(post, target, chrome, css, logo)
        tiles += 1
        print(f"  {target.name} ({target.stat().st_size // 1024} kB) – {post.theme['label']}")

    print(f"\nFertig: {tiles} Kacheln.")
    if missing_front_matter:
        print("\nDiese Beiträge haben kein image: im Front Matter. Zeile bitte ergänzen:")
        for post in missing_front_matter:
            print(f'  {post.path.relative_to(ROOT)}\n      image: "/images/{post.slug}.jpg"')
    return 0


if __name__ == "__main__":
    sys.exit(main())
