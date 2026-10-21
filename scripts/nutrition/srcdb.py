"""Reads the raw nutrition source files in data-sources/raw/ (see data-sources/manifest.json)
into one normalized list of records, per 100 g edible portion.

    record = dict(src, code, name, category, kcal, protein, fat, carb, fiber, sodium, water, refuse, flags)

    src    "SR" (USDA SR Legacy) | "FDN" (USDA Foundation Foods) | "MEXT" (日本食品標準成分表 八訂 増補2023)
    code   FDC ID (USDA) or 食品番号 (MEXT)
    carb   total carbohydrate including fibre (USDA "by difference" / MEXT 炭水化物 CHOCDF-)

The zip and xlsx files are read in place; nothing is extracted. Requires openpyxl.
"""
import csv
import io
import os
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "data-sources", "raw")
SR_ZIP = os.path.join(RAW, "FoodData_Central_sr_legacy_food_csv_2018-04.zip")
FDN_ZIP = os.path.join(RAW, "FoodData_Central_foundation_food_csv_2026-04-30.zip")
MEXT_XLSX = os.path.join(RAW, "mext_standard_tables_2023_ch2.xlsx")

N_KCAL, N_PROT, N_FAT, N_CARB, N_FIB, N_NA, N_WATER = 1008, 1003, 1004, 1005, 1079, 1093, 1051
N_KCAL_ATW_GEN, N_KCAL_ATW_SPEC, N_CARB_SUM, N_FAT_NLEA = 2047, 2048, 1050, 1085
WANTED = {N_KCAL, N_PROT, N_FAT, N_CARB, N_FIB, N_NA, N_WATER, N_KCAL_ATW_GEN, N_KCAL_ATW_SPEC, N_CARB_SUM, N_FAT_NLEA}


def _csv_rows(archive, name):
    member = next(m for m in archive.namelist() if m.endswith("/" + name) or m == name)
    with archive.open(member) as fh:
        yield from csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8"))


def _usda(path, src, data_type):
    foods = {}
    with zipfile.ZipFile(path) as archive:
        for row in _csv_rows(archive, "food.csv"):
            if row["data_type"] == data_type:
                foods[row["fdc_id"]] = {"src": src, "code": row["fdc_id"], "name": row["description"],
                                        "category": row.get("food_category_id", ""), "n": {}}
        for row in _csv_rows(archive, "food_nutrient.csv"):
            food = foods.get(row["fdc_id"])
            if food is None or row["amount"] in ("", None):
                continue
            nid = int(float(row["nutrient_id"]))
            if nid in WANTED:
                food["n"][nid] = float(row["amount"])
    out = []
    for food in foods.values():
        n = food.pop("n")
        food.update(
            kcal=n.get(N_KCAL, n.get(N_KCAL_ATW_SPEC, n.get(N_KCAL_ATW_GEN))),
            protein=n.get(N_PROT),
            fat=n.get(N_FAT, n.get(N_FAT_NLEA)),
            carb=n.get(N_CARB, n.get(N_CARB_SUM)),
            fiber=n.get(N_FIB),
            sodium=n.get(N_NA),
            water=n.get(N_WATER),
            refuse=None,
            flags="",
        )
        out.append(food)
    return out


def _mext_value(raw):
    """MEXT cells: numbers, '(1.2)' estimated, 'Tr' trace, '(Tr)', '(0)', '-' not measured, '' blank."""
    if raw is None:
        return None, ""
    if isinstance(raw, (int, float)):
        return float(raw), ""
    text = str(raw).strip()
    if text in ("", "-", "*"):
        return None, ""
    flag = ""
    if text.startswith("(") and text.endswith(")"):
        text, flag = text[1:-1], "est"
    if text == "Tr":
        return 0.0, "trace"
    try:
        return float(text), flag
    except ValueError:
        return None, f"?{raw}"


def _mext(path):
    import openpyxl

    sheet = openpyxl.load_workbook(path, read_only=True, data_only=True)["表全体"]
    header, out = None, []
    for index, row in enumerate(sheet.iter_rows(values_only=True), start=1):
        if index == 12:  # component identifiers (ENERC_KCAL, PROT-, FAT-, CHOCDF-, FIB-, NA, ...)
            header = {name: i for i, name in enumerate(row) if name}
            continue
        if index < 13 or not row or not row[1]:
            continue

        def get(key):
            return _mext_value(row[header[key]]) if key in header else (None, "")

        kcal, _ = get("ENERC_KCAL")
        protein, f1 = get("PROT-")
        if protein is None:
            protein, f1 = get("PROTCAA")
        fat, f2 = get("FAT-")
        if fat is None:
            fat, f2 = get("FATNLEA")
        carb, f3 = get("CHOCDF-")
        fiber, f4 = get("FIB-")
        out.append({
            "src": "MEXT", "code": str(row[1]), "name": str(row[3]).replace("　", " ").strip(), "category": str(row[0]),
            "kcal": kcal, "protein": protein, "fat": fat, "carb": carb, "fiber": fiber,
            "sodium": get("NA")[0], "water": get("WATER")[0], "refuse": get("REFUSE")[0],
            "flags": ",".join(sorted({f for f in (f1, f2, f3, f4) if f})),
        })
    return out


def load():
    for path in (SR_ZIP, FDN_ZIP, MEXT_XLSX):
        if not os.path.exists(path):
            raise SystemExit(f"Missing {path}. Run fetch-nutrition-sources.cmd (or node scripts/fetch-nutrition-sources.mjs) first.")
    return _usda(SR_ZIP, "SR", "sr_legacy_food") + _usda(FDN_ZIP, "FDN", "foundation_food") + _mext(MEXT_XLSX)


def index(records):
    return {(r["src"], r["code"]): r for r in records}
