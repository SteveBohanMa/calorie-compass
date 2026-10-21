"""Applies scripts/nutrition/catalog_spec.py to src/foods.json.

    python scripts/nutrition/build_catalog.py            # update src/foods.json and the audit files
    python scripts/nutrition/build_catalog.py --check    # only report; change nothing

Writes:
  src/foods.json                      catalog used by the app
  data-sources/source-values.json     every value with its exact source records and cross-checks
  data-sources/pending.csv            foods that still wait for the China tables or package labels
"""
import csv
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalog_spec as spec  # noqa: E402
import srcdb  # noqa: E402

ROOT = srcdb.ROOT
FOODS_PATH = os.path.join(ROOT, "src", "foods.json")
AUDIT_PATH = os.path.join(ROOT, "data-sources", "source-values.json")
PENDING_PATH = os.path.join(ROOT, "data-sources", "pending.csv")
CHECK_ONLY = "--check" in sys.argv

DB_ZH = {"SR": "USDA FoodData Central", "FDN": "USDA FoodData Central", "MEXT": "日本食品标准成分表（八订）增补2023"}
DB_EN = {"SR": "USDA FoodData Central", "FDN": "USDA FoodData Central", "MEXT": "Standard Tables of Food Composition in Japan 2023"}
STORE_BRANDS = {"便利蜂", "罗森", "全家", "7-Eleven"}
MACROS = ("protein", "carb", "fat", "fiber")
FIELD = {"protein": "ProteinPer100G", "carb": "CarbohydratePer100G", "fat": "FatPer100G", "fiber": "FiberPer100G"}


def zero_fibre_ok(record):
    """Fibre is 'not measured' for animal foods and clear seasonings/drinks; it is effectively zero there."""
    if record["src"] == "MEXT":
        return record["category"] in {"10", "11", "12", "13", "16", "17"}
    name = record["name"].lower()
    return name.startswith(("chicken", "beef", "pork", "fish", "crustaceans", "mollusks", "egg", "milk", "yogurt"))


def values_of(record):
    v = {k: record[k] for k in ("kcal",) + MACROS}
    if v["fiber"] is None and zero_fibre_ok(record):
        v["fiber"] = 0.0
    if v["carb"] is not None and v["carb"] < 0:  # USDA "by difference" can dip below zero for pure protein foods
        v["carb"] = 0.0
    return v


def source_text(entry, db):
    if "src" in entry:
        src, code = entry["src"]
        if src == "MEXT":
            return f"{DB_ZH[src]}（食品番号 {code}）", f"{DB_EN[src]} (No. {code})"
        part = "SR Legacy" if src == "SR" else "Foundation Foods"
        return f"{DB_ZH[src]} · {part}（FDC {code}）", f"{DB_EN[src]}, {part} (FDC {code})"
    dbs = []
    for key, _ in entry["recipe"]:
        name = spec.COMPONENTS[key][0]
        if name not in dbs:
            dbs.append(name)
    return "配方估算 · " + "、".join(DB_ZH[d] for d in dict.fromkeys(dbs)), "Recipe estimate · " + ", ".join(DB_EN[d] for d in dict.fromkeys(dbs))


def compute(entry, db):
    if "src" in entry:
        record = db[entry["src"]]
        return values_of(record), [{"src": record["src"], "code": record["code"], "name": record["name"], "grams": 100}]
    total = sum(grams for _, grams in entry["recipe"])
    acc = {k: 0.0 for k in ("kcal",) + MACROS}
    missing, parts = False, []
    for key, grams in entry["recipe"]:
        src, code, zh, en = spec.COMPONENTS[key]
        record = db[(src, code)]
        v = values_of(record)
        for k in acc:
            if v[k] is None:
                missing = missing or k != "kcal"
            else:
                acc[k] += v[k] * grams / total
        parts.append({"src": src, "code": code, "name": record["name"], "label": zh, "grams": grams})
    if missing:
        for k in MACROS:
            acc[k] = None
    return acc, parts


def consistent(kcal, macros):
    if any(macros[k] is None for k in MACROS):
        return None
    base = 4 * macros["protein"] + 4 * macros["carb"] + 9 * macros["fat"]
    tolerance = max(25, kcal * 0.2)
    return any(abs(e - kcal) <= tolerance for e in (base, base + 2 * macros["fiber"], base - 2 * macros["fiber"]))


def insert_after(record, after_key, items):
    """Return a copy of record with items placed right after after_key (existing keys keep their order)."""
    out = {}
    for key, value in record.items():
        if key in items:
            continue
        out[key] = value
        if key == after_key:
            out.update(items)
    for key, value in items.items():
        out.setdefault(key, value)
    return out


def main():
    db = srcdb.index(srcdb.load())
    foods = json.load(open(FOODS_PATH, encoding="utf-8"))
    by_id = {f["Id"]: f for f in foods}
    problems = []

    # ids that are already gone are fine: the script can be re-run on its own output
    foods = [f for f in foods if f["Id"] not in set(spec.DELETE)]

    # new oden records, modelled on the existing oden entry f031
    template = by_id["f031"]
    for rank, (fid, (zh, en, aliases, serving, _icon, _tone)) in enumerate(spec.NEW_ODEN.items()):
        if fid in by_id:
            continue
        record = {key: template[key] for key in template if key not in ("DataStatus", "NoteZh", "NoteEn")}
        record.update(Id=fid, NameZh=zh, NameEn=en, Aliases=aliases, Category="convenience", PreparationZh="关东煮",
                      PreparationEn="oden", Brand=spec.GENERIC_BRAND, ServingWeightG=serving, IncludesBroth=False,
                      IncludesSauce=False, UserProvided=False, PrimaryNutrient="mixed", FatLossPopular=False,
                      PopularityRank=20100 + rank, Image=f"/assets/food/catalog/{fid}.svg", ImageQuery=f"oden {en} food")
        foods.append(record)
    by_id = {f["Id"]: f for f in foods}

    for fid, change in spec.RENAME.items():
        record = by_id[fid]
        if "zh" in change:
            record["NameZh"] = change["zh"]
        if "en" in change:
            record["NameEn"] = change["en"]
        if "prep" in change:
            record["PreparationZh"], record["PreparationEn"] = change["prep"]
        if "broth" in change:
            record["IncludesBroth"] = change["broth"]
    for fid, grams in spec.SERVING.items():
        by_id[fid]["ServingWeightG"] = grams
    for fid, words in spec.ALIASES.items():
        current = by_id[fid]["Aliases"].split()
        by_id[fid]["Aliases"] = " ".join(dict.fromkeys(current + words.split()))

    audit = []
    for index, record in enumerate(foods):
        fid = record["Id"]
        entry = spec.SOURCES.get(fid)
        if entry is None:
            if record.get("DataStatus") != "placeholder":
                problems.append(f"{fid} {record['NameZh']}: visible record has no source entry")
            continue
        status = entry.get("status", "ready")
        cleaned = {k: v for k, v in record.items() if k not in ("NoteZh", "NoteEn")}
        if status != "ready":
            cleaned["DataStatus"] = "pending"
            for key in FIELD.values():
                cleaned.pop(key, None)
            cleaned["Source"] = ("等待中国食物成分表 / waiting for the China Food Composition Tables" if status == "pending-cn"
                                 else "等待包装标签 / waiting for package labels")
            # hidden until sourced; keep the serving maths consistent so the structure checks still hold
            cleaned["KcalPerServing"] = round(cleaned["KcalPer100G"] * cleaned["ServingWeightG"] / 100)
            foods[index] = cleaned
            audit.append({"id": fid, "zh": record["NameZh"], "status": status, "review": entry.get("review", "")})
            continue

        values, parts = compute(entry, db)
        kcal = round(values["kcal"])
        macros = {k: (None if values[k] is None else round(values[k], 1)) for k in MACROS}
        ok = consistent(kcal, macros)
        if ok is False:
            problems.append(f"{fid}: nutrients do not match {kcal} kcal")
        if ok is None:
            problems.append(f"{fid}: nutrients incomplete in the source; numbers kept, nutrients left out")
        zh_source, en_source = source_text(entry, db)
        cleaned.pop("DataStatus", None)
        if cleaned.get("Brand") in STORE_BRANDS:
            cleaned["Brand"] = spec.GENERIC_BRAND
        cleaned["KcalPer100G"] = kcal
        cleaned["KcalPerServing"] = round(kcal * cleaned["ServingWeightG"] / 100)
        for key, field in FIELD.items():
            if ok is None:
                cleaned.pop(field, None)
            else:
                cleaned[field] = macros[key]
        cleaned["ConfidenceGrade"] = entry["grade"]
        cleaned["UpdatedAt"] = spec.UPDATED_AT
        note = entry.get("note")
        extra = {"Source": f"{zh_source} / {en_source}"}
        if note:
            extra.update(NoteZh=note[0], NoteEn=note[1])
        cleaned = insert_after(cleaned, "ConfidenceGrade", extra)
        # keep macro fields together right after the calories
        macro_fields = {FIELD[k]: cleaned.pop(FIELD[k]) for k in MACROS if FIELD[k] in cleaned}
        cleaned = insert_after(cleaned, "KcalPer100G", macro_fields)
        foods[index] = cleaned

        checks = []
        for src, code in entry.get("check", []):
            other = db[(src, code)]
            checks.append({"src": src, "code": code, "name": other["name"], "kcal": other["kcal"],
                           "diff_pct": round((other["kcal"] - values["kcal"]) / values["kcal"] * 100, 1)})
        audit.append({"id": fid, "zh": cleaned["NameZh"], "status": "ready", "grade": entry["grade"], "kcal": kcal,
                      **{FIELD[k]: macros[k] for k in MACROS}, "sources": parts, "checks": checks,
                      "chinaTablesLater": bool(entry.get("cn")), "review": entry.get("review", "")})

    unused = sorted(set(spec.SOURCES) - {f["Id"] for f in foods})
    if unused:
        problems.append(f"source entries without a record: {unused}")

    visible = [f for f in foods if f.get("DataStatus") not in ("placeholder", "pending")]
    print(json.dumps({
        "records": len(foods), "visible": len(visible),
        "pending": sum(f.get("DataStatus") == "pending" for f in foods),
        "placeholder": sum(f.get("DataStatus") == "placeholder" for f in foods),
        "withNutrients": sum(all(FIELD[k] in f for k in MACROS) for f in visible),
        "grades": {g: sum(f["ConfidenceGrade"] == g for f in visible) for g in "ABC"},
        "oden": sum(f["PreparationZh"] == "关东煮" for f in visible),
    }, ensure_ascii=False, indent=2))
    if problems:
        print("\n".join(problems))
        if any(not p.endswith("left out") for p in problems):
            sys.exit(1)
    if CHECK_ONLY:
        return

    with open(FOODS_PATH, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(foods, ensure_ascii=False, indent=2) + "\n")
    with open(AUDIT_PATH, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps({"updatedAt": spec.UPDATED_AT, "foods": audit}, ensure_ascii=False, indent=1) + "\n")
    with open(PENDING_PATH, "w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["食物", "等什么", "数据从哪来"])
        writer.writerows(spec.PENDING)
    print(f"wrote {os.path.relpath(FOODS_PATH, ROOT)}, {os.path.relpath(AUDIT_PATH, ROOT)}, {os.path.relpath(PENDING_PATH, ROOT)}")


if __name__ == "__main__":
    main()
