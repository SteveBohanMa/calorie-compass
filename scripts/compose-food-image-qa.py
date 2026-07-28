import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
FOODS = json.loads((ROOT / "src" / "foods.json").read_text(encoding="utf-8"))
OUTPUT = ROOT / "verification-v25-images"
OUTPUT.mkdir(parents=True, exist_ok=True)

try:
    FONT = ImageFont.truetype("arial.ttf", 18)
except OSError:
    FONT = ImageFont.load_default()

CELL_W, CELL_H = 260, 220
COLS, ROWS = 5, 6
PAGE_SIZE = COLS * ROWS
hashes = {}
errors = []

for index, food in enumerate(FOODS):
    source = ROOT / "public" / food["Image"].lstrip("/")
    try:
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        hashes.setdefault(digest, []).append(food["Id"])
        with Image.open(source) as image:
            image.verify()
    except Exception as exc:
        errors.append({"id": food["Id"], "path": str(source), "error": str(exc)})

for page_start in range(0, len(FOODS), PAGE_SIZE):
    sheet = Image.new("RGB", (CELL_W * COLS, CELL_H * ROWS), "#f4fbf7")
    draw = ImageDraw.Draw(sheet)
    for offset, food in enumerate(FOODS[page_start : page_start + PAGE_SIZE]):
        x = (offset % COLS) * CELL_W
        y = (offset // COLS) * CELL_H
        source = ROOT / "public" / food["Image"].lstrip("/")
        with Image.open(source) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            image = ImageOps.fit(image, (CELL_W - 16, 166), method=Image.Resampling.LANCZOS)
            sheet.paste(image, (x + 8, y + 8))
        caption = f'{food["Id"]}  {food["NameEn"]}'
        draw.text((x + 9, y + 181), caption[:34], fill="#15372e", font=FONT)
    page_number = page_start // PAGE_SIZE + 1
    sheet.save(OUTPUT / f"food-contact-sheet-{page_number:02d}.jpg", quality=88, optimize=True)

method_names = ["pan", "deep", "stir", "steam", "boil", "roast", "braise", "simmer", "blanch", "raw", "soup", "microwave"]
method_sheet = Image.new("RGB", (CELL_W * 4, CELL_H * 3), "#f4fbf7")
method_draw = ImageDraw.Draw(method_sheet)
for index, name in enumerate(method_names):
    x = (index % 4) * CELL_W
    y = (index // 4) * CELL_H
    source = ROOT / "public" / "assets" / "food" / f"method-{name}.jpg"
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image = ImageOps.fit(image, (CELL_W - 16, 166), method=Image.Resampling.LANCZOS)
        method_sheet.paste(image, (x + 8, y + 8))
    method_draw.text((x + 9, y + 181), name, fill="#15372e", font=FONT)
method_sheet.save(OUTPUT / "method-contact-sheet.jpg", quality=90, optimize=True)

report = {
    "total": len(FOODS),
    "invalid": errors,
    "duplicateContent": [ids for ids in hashes.values() if len(ids) > 1],
    "uniqueContent": len(hashes),
}
(OUTPUT / "image-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
