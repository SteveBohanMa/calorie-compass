"""Writes the picture for each new oden record: a Noto Emoji icon on the app's tone colour.

These stand in until real photos are added; each record still owns its own file, as AGENTS.md requires.

    python scripts/nutrition/build_oden_icons.py [path/to/@iconify-json/noto/icons.json]

Noto Emoji: Copyright Google Inc., Apache License 2.0 (https://github.com/googlefonts/noto-emoji).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalog_spec as spec  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ICONS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "node_modules", "@iconify-json", "noto", "icons.json")
OUT = os.path.join(ROOT, "public", "assets", "food", "catalog")
TONES = {"mint": ("#d9f5e9", "#f5fcf8"), "lime": ("#e5f7cf", "#f6fcef"), "sky": ("#def1f4", "#f4fbfc"), "peach": ("#fae9da", "#fdf6ef")}
SIZE, ICON = 640, 300

noto = json.load(open(ICONS, encoding="utf-8"))
default_w, default_h = noto.get("width", 128), noto.get("height", 128)
os.makedirs(OUT, exist_ok=True)
for fid, (_zh, en, _aliases, _serving, icon_name, tone) in spec.NEW_ODEN.items():
    icon = noto["icons"][icon_name]
    w, h = icon.get("width", default_w), icon.get("height", default_h)
    scale = ICON / max(w, h)
    x, y = (SIZE - w * scale) / 2, (SIZE - h * scale) / 2
    bg, plate = TONES[tone]
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" width="{SIZE}" height="{SIZE}">'
        f"<title>{en}</title>"
        f'<rect width="{SIZE}" height="{SIZE}" fill="{bg}"/>'
        f'<circle cx="{SIZE / 2}" cy="{SIZE / 2}" r="{SIZE * 0.36:.0f}" fill="{plate}"/>'
        f'<g transform="translate({x:.2f} {y:.2f}) scale({scale:.4f})">{icon["body"]}</g>'
        "</svg>\n"
    )
    with open(os.path.join(OUT, f"{fid}.svg"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(svg)
print(f"wrote {len(spec.NEW_ODEN)} oden pictures to {os.path.relpath(OUT, ROOT)}")
