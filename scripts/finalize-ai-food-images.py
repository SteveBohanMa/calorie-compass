import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
FOODS_PATH = ROOT / "src" / "foods.json"
AI_DIR = ROOT / "public" / "assets" / "food" / "ai"
CATALOG_DIR = ROOT / "public" / "assets" / "food" / "catalog"
REPLACEMENTS = json.loads((ROOT / "verification-v25-images" / "ai-replacement-list.json").read_text(encoding="utf-8"))
FOODS = json.loads(FOODS_PATH.read_text(encoding="utf-8"))

replacement_ids = {item["id"] for item in REPLACEMENTS}
canonical_ids = {food["Id"] for food in FOODS[:50]}
generated_ids = {item["id"] for item in REPLACEMENTS if (AI_DIR / f'{item["id"]}.png').exists()}
missing_canonical = sorted(canonical_ids.intersection(replacement_ids) - generated_ids)
if missing_canonical:
    raise SystemExit(f"Missing {len(missing_canonical)} canonical generated images: {', '.join(missing_canonical)}")

for food in FOODS:
    if food["Id"] not in generated_ids:
        continue
    source = AI_DIR / f'{food["Id"]}.png'
    target = CATALOG_DIR / f'{food["Id"]}-ai.jpg'
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image = ImageOps.fit(image, (768, 576), method=Image.Resampling.LANCZOS)
        image.save(target, "JPEG", quality=88, optimize=True, progressive=True)
    food["Image"] = f'/assets/food/catalog/{food["Id"]}-ai.jpg'

method_names = ["pan", "deep", "stir", "steam", "boil", "roast", "braise", "simmer", "blanch", "raw", "soup", "microwave"]
missing_methods = [name for name in method_names if not (AI_DIR / f"method-{name}.png").exists()]
if missing_methods:
    raise SystemExit(f"Missing generated method images: {', '.join(missing_methods)}")
for name in method_names:
    source = AI_DIR / f"method-{name}.png"
    target = ROOT / "public" / "assets" / "food" / f"method-{name}.jpg"
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image = ImageOps.fit(image, (768, 576), method=Image.Resampling.LANCZOS)
        image.save(target, "JPEG", quality=88, optimize=True, progressive=True)

final_foods = [food for food in FOODS if food["Id"] in canonical_ids or food["Id"] not in replacement_ids]
FOODS_PATH.write_text(json.dumps(final_foods, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "verification-v25-images" / "catalog-selection.json").write_text(
    json.dumps({
        "sourceRecords": len(FOODS),
        "finalRecords": len(final_foods),
        "generatedCanonicalPhotos": len(generated_ids),
        "retainedReviewedWebPhotos": len(final_foods) - len(generated_ids),
        "removedForImageQuality": [food["Id"] for food in FOODS if food not in final_foods],
    }, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(json.dumps({"finalized": len(generated_ids), "methodImages": len(method_names), "finalRecords": len(final_foods), "retainedWebPhotos": len(final_foods) - len(generated_ids)}, indent=2))
