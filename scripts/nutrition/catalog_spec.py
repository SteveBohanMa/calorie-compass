"""Catalog decisions for the data rebuild, batch 1 (reviewed by the user on 2026-10-16).

build_catalog.py applies this file to src/foods.json. Every number comes from a source record;
nothing here is typed in by hand except recipe weights, which are labelled as estimates.

SOURCES[id]
  src     ("SR" | "FDN" | "MEXT", code)            one source item, per 100 g as eaten
  recipe  [(component key, grams), ...]            weighted mix of COMPONENTS, normalised to 100 g
  check   [(src, code), ...]                        independent source(s) for cross-checking (audit only)
  grade   A = the source has this exact cooking method
          B = similar method, or a simple recipe of verified components
          C = varies by brand/store; typical value only, the package label wins
  status  "ready" (default) | "pending-cn" | "pending-photo"   (pending records stay hidden)
  cn      True = re-check against the China Food Composition Tables when the book arrives
  note    (zh, en) shown on the food detail page
  review  internal note for data-sources/source-values.json
"""

UPDATED_AT = "2026-10-16"

# Recipe components: key -> (src, code, zh, en)
COMPONENTS = {
    "oil": ("SR", "171411", "大豆油", "soybean oil"),
    "sesame": ("SR", "171016", "香油", "sesame oil"),
    "soy": ("MEXT", "17007", "酱油", "soy sauce"),
    "mayo": ("MEXT", "17042", "蛋黄酱", "mayonnaise"),
    "riceball": ("MEXT", "01111", "饭团米饭", "rice-ball rice"),
    "rice": ("MEXT", "01088", "米饭", "cooked rice"),
    "bread": ("MEXT", "01175", "吐司", "white bread"),
    "romaine": ("SR", "169247", "生菜", "romaine lettuce"),
    "tomato": ("SR", "170457", "番茄", "tomato"),
    "cucumber": ("SR", "168409", "黄瓜", "cucumber"),
    "chicken_breast": ("SR", "171478", "鸡胸肉", "chicken breast"),
    "rice_noodles": ("SR", "168914", "熟米粉", "cooked rice noodles"),
    "udon": ("MEXT", "01039", "乌冬面", "udon"),
    "lean_beef": ("SR", "168649", "熟瘦牛肉", "cooked lean beef"),
    "firm_tofu": ("MEXT", "04032", "北豆腐", "firm tofu"),
    "kelp": ("MEXT", "09056", "海带", "kelp"),
    "espresso": ("SR", "171891", "浓缩咖啡", "espresso"),
    "lowfat_milk": ("SR", "170872", "低脂牛奶", "low-fat milk"),
    "tuna": ("MEXT", "10263", "油浸金枪鱼", "oil-packed tuna"),
    "chicken_thigh": ("MEXT", "11225", "烤鸡腿肉", "grilled chicken thigh"),
    "ham": ("MEXT", "11176", "火腿", "ham"),
    "cheese": ("MEXT", "13040", "芝士", "processed cheese"),
    "egg": ("MEXT", "12005", "水煮蛋", "boiled egg"),
    "sesame_dressing": ("MEXT", "17117", "芝麻沙拉汁", "sesame dressing"),
    "mentsuyu": ("MEXT", "17029", "面汁", "noodle broth base"),
    "dashi": ("MEXT", "17021", "高汤", "dashi"),
    "mirin": ("MEXT", "16025", "味醂", "mirin"),
    "stirfried_greens": ("MEXT", "06338", "炒青菜", "stir-fried greens"),
    "beef": ("MEXT", "11270", "烤牛肉", "grilled beef"),
}

STEAM_DRY = ("用干烤熟制值近似清蒸", "Dry-heat cooked value used for steaming")
STEAM_BOIL = ("用水煮值近似清蒸", "Boiled value used for steaming")
LABEL = "以包装为准"
LABEL_EN = "check the package label"

SOURCES = {
    # ---------------- staples ----------------
    "f001": dict(src=("SR", "169757"), check=[("MEXT", "01088")], grade="A", cn=True,
                 review="三个来源含水量不同差距大；国内蒸米饭以中国表为准，书到之前先用 USDA"),
    "f002": dict(src=("SR", "169704"), check=[("MEXT", "01085")], grade="A",
                 review="日本糙米饭煮得更干（含水 60% 对 70%），所以每 100 g 热量更高"),
    "f003": dict(src=("SR", "173905"), grade="A", note=("加水煮、不加糖", "Cooked in water, no sugar")),
    "f004": dict(src=("SR", "172688"), check=[("MEXT", "01208")], grade="A"),
    "f005": dict(src=("SR", "168483"), check=[("MEXT", "02008")], grade="A", cn=True,
                 review="美国橙心红薯含水多；日本红薯淀粉多。国内品种不一"),
    "f006": dict(src=("SR", "169999"), check=[("MEXT", "06176")], grade="A", cn=True,
                 note=("可食部，不含玉米芯", "Edible part, cob excluded")),
    "f007": dict(src=("MEXT", "02018"), check=[("SR", "170440")], grade="A", review="日本表有“蒸”的实测值"),
    "v24-001": dict(src=("SR", "168871"), grade="A"),
    "v24-002": dict(status="pending-cn", grade="A", cn=True, review="USDA 和日本表都没有小米粥，等中国表"),
    "v24-011": dict(src=("MEXT", "01184"), grade="A", review="日本表有黑米饭的实测值"),
    "v24-024": dict(src=("SR", "168928"), grade="A", note=("不含酱", "Sauce not included")),
    "v24-026": dict(recipe=[("rice_noodles", 95), ("oil", 5)], grade="B",
                    note=("按熟米粉 95% + 油 5% 估算", "Estimated as 95% cooked rice noodles + 5% oil")),
    "v24-028": dict(recipe=[("udon", 95), ("oil", 5)], grade="B",
                    note=("按熟乌冬面 95% + 油 5% 估算", "Estimated as 95% cooked udon + 5% oil")),
    "v24-032": dict(src=("MEXT", "02049"), check=[("SR", "168483")], grade="B",
                    note=("用“蒸紫薯”的数值近似", "Steamed purple sweet potato value used")),
    "v24-040": dict(src=("MEXT", "06332"), grade="A"),
    "v24-042": dict(src=("MEXT", "05013"), check=[("SR", "170573")], grade="A",
                    note=("糖炒栗子，去壳后的重量", "Roasted sweet chestnuts, shelled weight")),
    # ---------------- meat, eggs, tofu ----------------
    "f008": dict(src=("SR", "171478"), check=[("FDN", "331960")], grade="A", note=("去皮", "Skinless")),
    "f009": dict(src=("SR", "171078"), grade="A", note=("去皮", "Skinless")),
    "f010": dict(src=("SR", "171477"), check=[("MEXT", "11288")], grade="A", note=("去皮", "Skinless")),
    "f011": dict(src=("MEXT", "12005"), check=[("SR", "173424")], grade="A", cn=True, note=("去壳", "Shelled")),
    "f012": dict(src=("SR", "173423"), check=[("MEXT", "12021")], grade="A"),
    "f013": dict(src=("SR", "169442"), grade="B", cn=True,
                 note=("暂用炖牛腱子的数值；卤汁另算", "Simmered beef shank value for now; braising liquid not included")),
    "f014": dict(src=("SR", "169457"), grade="B",
                 note=("西冷牛排，用烤的数值近似；煎的油另算", "Sirloin, broiled value used; cooking oil not included")),
    "f015": dict(recipe=[("lean_beef", 95), ("oil", 5)], grade="B",
                 note=("按熟瘦牛肉 95% + 油 5% 估算", "Estimated as 95% cooked lean beef + 5% oil")),
    "v24-073": dict(src=("SR", "171061"), grade="A"),
    "v24-074": dict(src=("SR", "174491"), grade="B", note=("用“煎鸡肝”的数值近似", "Pan-fried chicken liver value used")),
    "v24-082": dict(src=("SR", "168313"), check=[("MEXT", "11278")], grade="B",
                    note=("用“烤里脊”的数值近似；煎的油另算", "Broiled tenderloin value used; cooking oil not included")),
    "f018": dict(src=("MEXT", "04032"), check=[("SR", "172448")], grade="A", cn=True,
                 review="暂用日本木棉豆腐；美国 firm tofu 差别大"),
    "f019": dict(recipe=[("firm_tofu", 92), ("sesame", 3), ("soy", 5)], grade="B",
                 note=("按北豆腐 92% + 香油 3% + 酱油 5% 估算", "Estimated as 92% firm tofu + 3% sesame oil + 5% soy sauce")),
    # ---------------- fish & seafood ----------------
    "f016": dict(src=("SR", "175177"), grade="B",
                 note=("用罗非鱼近似（国内鱼柳多是巴沙鱼）", "Tilapia used (fillets in China are often basa)")),
    "f017": dict(src=("SR", "175180"), check=[("MEXT", "10322")], grade="A"),
    "v24-096": dict(src=("SR", "175168"), grade="A"),
    "v24-099": dict(src=("SR", "171956"), check=[("MEXT", "10206")], grade="B", note=STEAM_DRY),
    "v24-100": dict(src=("SR", "171956"), check=[("MEXT", "10206")], grade="A"),
    "v24-101": dict(src=("SR", "175177"), grade="B", note=STEAM_DRY),
    "v24-102": dict(src=("SR", "175177"), grade="A"),
    "v24-103": dict(src=("SR", "173694"), grade="B", note=STEAM_DRY),
    "v24-104": dict(src=("SR", "173694"), grade="A"),
    "v24-105": dict(src=("MEXT", "10155"), check=[("SR", "175120")], grade="B",
                    note=("用水煮值近似清蒸", "Simmered value used for steaming")),
    "v24-106": dict(src=("MEXT", "10156"), check=[("SR", "175120")], grade="A"),
    "v24-110": dict(src=("SR", "173718"), grade="A"),
    "v24-112": dict(src=("SR", "175166"), grade="A"),
    "v24-118": dict(src=("MEXT", "10070"), check=[("SR", "174194")], grade="A", note=("蒲烧，含酱汁", "Kabayaki, glaze included")),
    "v24-120": dict(src=("MEXT", "10323"), check=[("SR", "175180")], grade="A"),
    "v24-123": dict(src=("SR", "174209"), grade="A"),
    "v24-126": dict(src=("MEXT", "10347"), grade="A",
                    note=("只算鱿鱼；刷的油和酱另算", "Squid only; brushed oil and sauce not included")),
    "v24-127": dict(src=("MEXT", "10362"), check=[("SR", "174249")], grade="A",
                    review="美国数据是久煮失水后的值；国内白灼章鱼更接近日本表"),
    "v24-129": dict(src=("SR", "167742"), check=[("MEXT", "10312")], grade="A"),
    "v24-130": dict(src=("MEXT", "10414"), grade="A",
                    note=("只算扇贝肉；蒜蓉粉丝和油另算", "Scallop meat only; garlic, vermicelli and oil not included")),
    "v24-132": dict(src=("SR", "174217"), grade="B", note=("用水煮值近似", "Moist-heat value used")),
    "v24-134": dict(src=("MEXT", "10466"), check=[("SR", "171975")], grade="B",
                    note=("花甲贝肉，用蒸的数值近似", "Manila clam meat, steamed value used"),
                    review="国内花甲就是日本表的“あさり”；美国蛤蜊品种不同，不用"),
    # ---------------- vegetables & seaweed ----------------
    "f020": dict(src=("SR", "169967"), grade="A"),
    "f021": dict(src=("MEXT", "06338"), grade="A",
                 note=("含炒菜吸进的油；放油多时会更高", "Includes absorbed oil; higher with more oil")),
    "f022": dict(recipe=[("cucumber", 95), ("sesame", 2), ("soy", 3)], grade="B",
                 note=("按黄瓜 95% + 香油 2% + 酱油 3% 估算", "Estimated as 95% cucumber + 2% sesame oil + 3% soy sauce")),
    "f023": dict(recipe=[("romaine", 50), ("tomato", 30), ("cucumber", 20)], grade="B",
                 note=("按生菜 50% + 番茄 30% + 黄瓜 20% 估算", "Estimated as 50% lettuce + 30% tomato + 20% cucumber")),
    "v24-181": dict(src=("SR", "168462"), grade="A"),
    "v24-182": dict(src=("SR", "168463"), grade="A"),
    "v24-185": dict(src=("SR", "169249"), grade="A"),
    "v24-186": dict(src=("SR", "169249"), grade="B",
                    note=("用生菜的数值近似；蚝油和油另算", "Raw lettuce value used; oyster sauce and oil not included")),
    "v24-188": dict(src=("MEXT", "06062"), check=[("SR", "169976")], grade="B", note=STEAM_BOIL),
    "v24-192": dict(src=("SR", "170397"), grade="B", note=STEAM_BOIL),
    "v24-193": dict(src=("SR", "168390"), grade="A"),
    "v24-195": dict(src=("SR", "169988"), grade="A"),
    "v24-209": dict(src=("SR", "169141"), grade="A", note=("四季豆一定要煮熟", "Green beans must be fully cooked")),
    "v24-245": dict(recipe=[("kelp", 93), ("sesame", 2), ("soy", 5)], grade="B",
                    note=("按海带 93% + 香油 2% + 酱油 5% 估算", "Estimated as 93% kelp + 2% sesame oil + 5% soy sauce")),
    "v24-246": dict(src=("MEXT", "09056"), grade="A"),
    # ---------------- fruit ----------------
    "f024": dict(src=("MEXT", "07107"), check=[("SR", "173944")], grade="A", cn=True, note=("可食部", "Edible part")),
    "f025": dict(src=("SR", "171688"), check=[("MEXT", "07176")], grade="A", cn=True, note=("带皮", "With skin")),
    "v24-047": dict(src=("SR", "169097"), grade="A", note=("可食部", "Edible part")),
    "v24-051": dict(src=("SR", "174683"), grade="A"),
    "v24-055": dict(src=("SR", "171711"), grade="A"),
    "v24-057": dict(src=("SR", "167762"), grade="A"),
    "v24-177": dict(src=("SR", "171705"), grade="A", note=("可食部", "Edible part")),
    # ---------------- nuts & seeds ----------------
    "f028": dict(src=("SR", "170158"), grade="A", note=("干烤、无盐", "Dry roasted, unsalted")),
    "v24-151": dict(src=("SR", "170187"), grade="A", note=("去壳", "Shelled")),
    "v24-153": dict(src=("SR", "170162"), grade="A"),
    "v24-161": dict(src=("SR", "170581"), grade="A", note=("去壳", "Shelled")),
    "v24-162": dict(src=("SR", "170583"), grade="A", note=("去壳", "Shelled")),
    "v24-163": dict(src=("SR", "172430"), grade="A", note=("去壳", "Shelled")),
    "v24-168": dict(src=("SR", "170557"), grade="A", note=("去壳后的重量", "Shelled weight")),
    # ---------------- dairy, drinks, condiments ----------------
    "f026": dict(src=("SR", "170886"), grade="B", note=("国内无糖酸奶差别大，" + LABEL, "Varies by brand; " + LABEL_EN)),
    "f027": dict(src=("SR", "170872"), grade="A"),
    "f049": dict(src=("SR", "173768"), check=[("MEXT", "04052")], grade="B", cn=True,
                 note=("暂用无糖豆奶的数值；现磨豆浆浓淡不一", "Unsweetened soy milk value for now; fresh soy milk varies")),
    "f050": dict(recipe=[("espresso", 60), ("lowfat_milk", 240)], grade="B",
                 note=("按浓缩咖啡 20% + 低脂奶 80% 估算", "Estimated as 20% espresso + 80% low-fat milk")),
    "f029": dict(src=("SR", "172470"), grade="A"),
    "f030": dict(src=("SR", "171009"), check=[("MEXT", "17042")], grade="B",
                 note=("按蛋黄酱算；国内甜沙拉酱通常更低，" + LABEL,
                       "Mayonnaise value; sweet salad dressings are usually lower — " + LABEL_EN)),
    # ---------------- convenience-store foods ----------------
    "f037": dict(src=("MEXT", "15035"), grade="B", note=("按日本肉包的数值", "Japanese pork bun value")),
    "f038": dict(status="pending-cn", grade="B", cn=True, review="USDA 和日本表都没有素包子，等中国表"),
    "f039": dict(recipe=[("riceball", 85), ("tuna", 10.5), ("mayo", 4.5)], grade="C",
                 note=("按配方估算：米饭 85% + 金枪鱼 10.5% + 蛋黄酱 4.5%；" + LABEL,
                       "Recipe estimate: 85% rice, 10.5% tuna, 4.5% mayo; " + LABEL_EN)),
    "f040": dict(recipe=[("riceball", 85), ("chicken_thigh", 15)], grade="C",
                 note=("按配方估算：米饭 85% + 烤鸡腿肉 15%；" + LABEL, "Recipe estimate: 85% rice, 15% grilled chicken; " + LABEL_EN)),
    "f041": dict(recipe=[("bread", 50), ("ham", 20), ("cheese", 15), ("mayo", 5), ("romaine", 10)], grade="C",
                 note=("按配方估算：吐司 50% + 火腿 20% + 芝士 15% + 蛋黄酱 5% + 生菜 10%；" + LABEL,
                       "Recipe estimate: 50% bread, 20% ham, 15% cheese, 5% mayo, 10% lettuce; " + LABEL_EN)),
    "f042": dict(recipe=[("bread", 50), ("egg", 35), ("mayo", 15)], grade="C",
                 note=("按配方估算：吐司 50% + 鸡蛋 35% + 蛋黄酱 15%；" + LABEL,
                       "Recipe estimate: 50% bread, 35% egg, 15% mayo; " + LABEL_EN)),
    "f043": dict(src=("MEXT", "11307"), grade="C",
                 note=("按维也纳香肠算；国内烤肠常加淀粉，" + LABEL, "Wiener sausage value; " + LABEL_EN)),
    "f044": dict(recipe=[("chicken_breast", 30), ("romaine", 35), ("tomato", 10), ("cucumber", 10), ("sesame_dressing", 15)], grade="C",
                 note=("按配方估算：鸡胸 30% + 蔬菜 55% + 芝麻沙拉汁 15%；" + LABEL,
                       "Recipe estimate: 30% chicken, 55% vegetables, 15% sesame dressing; " + LABEL_EN)),
    "f045": dict(recipe=[("chicken_breast", 33), ("romaine", 40), ("tomato", 13.5), ("cucumber", 13.5)], grade="C",
                 note=("按配方估算：鸡胸 33% + 蔬菜 67%；" + LABEL, "Recipe estimate: 33% chicken, 67% vegetables; " + LABEL_EN)),
    "f046": dict(recipe=[("udon", 48), ("mentsuyu", 26), ("dashi", 26)], grade="C",
                 note=("按配方估算：乌冬面 48% + 汤 52%", "Recipe estimate: 48% udon, 52% broth")),
    "f047": dict(recipe=[("rice", 50), ("chicken_thigh", 22), ("stirfried_greens", 23), ("oil", 3), ("soy", 2)], grade="C",
                 note=("按配方估算：米饭 50% + 鸡肉 22% + 炒青菜 23% + 油和酱油 5%；" + LABEL,
                       "Recipe estimate: 50% rice, 22% chicken, 23% greens, 5% oil and soy sauce; " + LABEL_EN)),
    "f048": dict(recipe=[("rice", 50), ("beef", 22), ("stirfried_greens", 23), ("oil", 3), ("soy", 2)], grade="C",
                 note=("按配方估算：米饭 50% + 牛肉 22% + 炒青菜 23% + 油和酱油 5%；" + LABEL,
                       "Recipe estimate: 50% rice, 22% beef, 23% greens, 5% oil and soy sauce; " + LABEL_EN)),
    # ---------------- oden ----------------
    "f031": dict(src=("MEXT", "06135"), grade="A"),
    "f033": dict(src=("MEXT", "02005"), grade="A"),
    "f035": dict(src=("MEXT", "09056"), grade="A"),
    "f034": dict(src=("MEXT", "12005"), grade="A"),
    "f032": dict(src=("MEXT", "10386"), grade="C",
                 note=("没有鱼豆腐的数据，用炸鱼饼近似；" + LABEL, "No fish-tofu entry, fried fish cake used; " + LABEL_EN)),
    "f036": dict(recipe=[("dashi", 90), ("soy", 5), ("mirin", 5)], grade="B",
                 note=("按高汤 90% + 酱油 5% + 味醂 5% 估算", "Estimated as 90% dashi + 5% soy sauce + 5% mirin")),
    "od-001": dict(src=("MEXT", "10383"), grade="C", note=("按日本鱼肉丸算；各家配方不同，" + LABEL, "Japanese fish ball value; " + LABEL_EN)),
    "od-007": dict(src=("MEXT", "10376"), grade="A"),
    "od-008": dict(src=("MEXT", "10381"), grade="A"),
    "od-009": dict(src=("MEXT", "10386"), grade="A"),
    "od-010": dict(src=("MEXT", "10379"), grade="A"),
    "od-012": dict(src=("MEXT", "04084"), grade="B",
                   note=("按去油的油炸豆腐皮算；泡过汤会更低", "Blanched aburaage value; lower after soaking in broth")),
    "od-014": dict(src=("MEXT", "04087"), grade="A"),
    "od-015": dict(src=("MEXT", "04091"), grade="B", note=("用泡发的干汤叶近似", "Rehydrated dried yuba value used")),
    "od-016": dict(src=("MEXT", "08040"), grade="A"),
    "od-017": dict(src=("MEXT", "08002"), grade="A"),
    "od-018": dict(src=("MEXT", "06234"), grade="A"),
    "od-019": dict(src=("MEXT", "06176"), grade="A", note=("可食部，不含玉米芯", "Edible part, cob excluded")),
    "od-020": dict(src=("MEXT", "02019"), grade="A"),
    "od-021": dict(src=("MEXT", "06318"), grade="A"),
    "od-022": dict(src=("MEXT", "06151"), grade="A"),
    "od-023": dict(src=("MEXT", "02005"), grade="A"),
    "od-025": dict(src=("MEXT", "11306"), grade="C",
                   note=("按维也纳香肠算；国内脆皮肠常加淀粉，" + LABEL, "Wiener sausage value; " + LABEL_EN)),
    "od-026": dict(src=("MEXT", "10388"), grade="A"),
    "od-027": dict(src=("MEXT", "11101"), grade="A"),
    "od-028": dict(src=("MEXT", "12003"), grade="A"),
    "od-029": dict(src=("MEXT", "01039"), grade="A", note=("不含汤", "Noodles only, no broth")),
}

# Records removed from the catalog (reviewed list; images stay in public/ and are pruned from builds).
DELETE = [
    "v24-004", "v24-006", "v24-010", "v24-094", "v24-097", "v24-098", "v24-107", "v24-108", "v24-109",
    "v24-114", "v24-116", "v24-117", "v24-122", "v24-124", "v24-128", "v24-183", "v24-184", "v24-211",
    "v24-229", "v24-230", "v24-058", "v24-178", "v24-175",
    "v24-247",  # 凉拌紫菜: no data for rehydrated nori anywhere; deletion suggested in the source check
]

# Name / cooking-method changes: id -> dict(zh, en, prep=(zh, en), broth)
RENAME = {
    "v24-002": dict(zh="小米粥", en="Millet porridge"),
    "v24-024": dict(zh="意大利面（水煮）", en="Boiled pasta", prep=("水煮", "boiled")),
    "v24-026": dict(zh="炒米粉"),
    "v24-028": dict(zh="炒乌冬面"),
    "v24-182": dict(zh="白灼菠菜", en="Blanched spinach", prep=("白灼", "blanched")),
    "v24-186": dict(zh="白灼生菜", en="Blanched lettuce", prep=("白灼", "blanched")),
    "v24-193": dict(zh="白灼芦笋", en="Blanched asparagus", prep=("白灼", "blanched")),
    "v24-209": dict(zh="水煮四季豆", en="Boiled green beans", prep=("水煮", "boiled")),
    "v24-246": dict(zh="水煮海带", en="Boiled kelp", prep=("水煮", "boiled"), broth=False),
}

# Typical serving weights (grams, edible part) from the reviewed list.
SERVING = {
    "f031": 70, "f033": 60, "f035": 45, "f034": 50, "f032": 45,
    "v24-002": 250, "v24-042": 100, "v24-073": 100, "v24-074": 100, "v24-118": 100,
}

# Extra search words (aliases) for existing records.
ALIASES = {
    "f031": "白萝卜 萝卜",
    "f033": "魔芋 魔芋结 蒟蒻",
    "f035": "昆布 昆布串 kombu",
}

# The old store names on these records described where the GPT-era estimates came from; the numbers
# are now generic table values, so the brand becomes generic.
GENERIC_BRAND = "通用 / Generic"

# New oden records: id -> (zh, en, aliases, serving g, icon, tone)
NEW_ODEN = {
    "od-001": ("关东煮鱼丸", "Oden fish balls", "鱼丸 鱼蛋 港式鱼蛋 多彩鱼丸 咖喱鱼丸 fish ball", 45, "oden", "peach"),
    "od-007": ("关东煮蟹味棒", "Oden imitation crab sticks", "蟹棒 蟹味棒 蟹柳 crab stick", 30, "crab", "peach"),
    "od-008": ("关东煮竹轮", "Oden chikuwa", "竹轮 竹轮卷 全烧竹轮卷 蟹肉竹轮烧 chikuwa", 30, "fish-cake-with-swirl", "sky"),
    "od-009": ("关东煮甜不辣", "Oden fried fish cake", "甜不辣 天妇罗 天麸罗 炸鱼饼 tempura", 40, "oden", "lime"),
    "od-010": ("关东煮鱼糕", "Oden steamed fish cake", "鱼糕 鱼板 kamaboko", 40, "fish-cake-with-swirl", "peach"),
    "od-012": ("关东煮油扬豆腐", "Oden fried tofu pouch", "油扬 油扬豆腐串 油炸豆腐皮 aburaage", 30, "falafel", "lime"),
    "od-014": ("关东煮冻豆腐", "Oden frozen tofu", "冻豆腐 豆腐", 50, "oden", "sky"),
    "od-015": ("关东煮腐竹", "Oden tofu skin", "腐竹 豆皮卷 yuba", 40, "oden", "mint"),
    "od-016": ("关东煮香菇", "Oden shiitake", "香菇 香菇串 shiitake", 40, "brown-mushroom", "mint"),
    "od-017": ("关东煮金针菇", "Oden enoki", "金针菇 enoki", 40, "brown-mushroom", "lime"),
    "od-018": ("关东煮娃娃菜", "Oden napa cabbage", "娃娃菜 白菜 napa", 60, "leafy-green", "mint"),
    "od-019": ("关东煮玉米", "Oden corn on the cob", "玉米 玉米棒 玉米段 corn", 50, "ear-of-corn", "lime"),
    "od-020": ("关东煮土豆", "Oden potato", "土豆 马铃薯 potato", 60, "potato", "peach"),
    "od-021": ("关东煮莲藕", "Oden lotus root", "莲藕 藕 lotus root", 40, "oden", "lime"),
    "od-022": ("关东煮竹笋", "Oden bamboo shoots", "竹笋 笋 bamboo shoot", 40, "oden", "mint"),
    "od-023": ("关东煮魔芋丝", "Oden shirataki", "魔芋丝 魔芋 shirataki", 50, "oden", "sky"),
    "od-025": ("关东煮香肠", "Oden sausage", "香肠 脆皮肠 热狗肠 开花肠 sausage", 50, "hot-dog", "peach"),
    "od-026": ("关东煮鱼肉肠", "Oden fish sausage", "鱼肉肠 鱼肠 fish sausage", 40, "fish", "sky"),
    "od-027": ("关东煮牛筋", "Oden beef tendon", "牛筋 牛蹄筋 beef tendon", 40, "cut-of-meat", "peach"),
    "od-028": ("关东煮鹌鹑蛋", "Oden quail eggs", "鹌鹑蛋 quail egg", 30, "egg", "lime"),
    "od-029": ("关东煮乌冬面", "Oden udon", "乌冬 乌冬面 udon", 150, "steaming-bowl", "mint"),
}

# Waiting for data (not in the catalog). Oden items are sold loose, so the realistic sources are the
# supermarket packs of the same products, or the store's own app.
PENDING = [
    # (name, waiting for, how to get it)
    ("小米粥", "中国表", "中国食物成分表"),
    ("菜包（素包子）", "中国表", "中国食物成分表"),
    ("油豆腐（豆腐泡）", "中国表", "中国食物成分表"),
    ("年糕", "中国表", "中国食物成分表"),
    ("百叶结 / 千张", "中国表", "中国食物成分表"),
    ("兰花干豆腐", "中国表", "中国食物成分表"),
    ("风琴豆腐皮", "中国表", "中国食物成分表（豆腐皮）"),
    ("牛肉丸 / 牛筋肉丸", "包装", "超市同类冷冻丸子包装，或便利店 App"),
    ("撒尿牛丸", "包装", "超市同类冷冻丸子包装，或便利店 App"),
    ("墨鱼丸", "包装", "超市同类冷冻丸子包装，或便利店 App"),
    ("虾丸 / 虾味球 / 龙虾球", "包装", "超市同类冷冻丸子包装，或便利店 App"),
    ("芝士丸 / 芝士星", "包装", "超市同类包装，或便利店 App"),
    ("香菇贡丸", "包装", "超市同类包装，或便利店 App"),
    ("脆骨丸 / 脆骨豆腐 / 脆骨麻花 / 黄金脆骨棒", "包装", "超市同类包装，或便利店 App"),
    ("鸡脆骨", "包装", "超市同类包装，或便利店 App"),
    ("福袋 / 糯米福袋", "包装", "超市同类包装，或便利店 App"),
    ("千张肉福包", "包装", "超市同类包装，或便利店 App"),
    ("千叶豆腐", "包装", "超市同类包装，或便利店 App"),
    ("金钱豆腐", "包装", "超市同类包装，或便利店 App"),
    ("包馅鱿鱼卷 / 鱿鱼棒 / 铁板花枝", "包装", "超市同类包装，或便利店 App"),
    ("北极翅", "包装", "超市同类包装，或便利店 App"),
    ("脆皮蒸饺", "包装", "超市同类包装，或便利店 App"),
    ("沸腾鱼棒", "包装", "超市同类包装，或便利店 App"),
    ("海苔鸡肉卷 / 昆布鸡肉棒", "包装", "超市同类包装，或便利店 App"),
    ("夹心鱼饼 / 鱼芙蓉", "包装", "超市同类包装，或便利店 App"),
    ("海鲜棒棒糖", "包装", "超市同类包装，或便利店 App"),
    ("黄金蛋烧", "包装", "超市同类包装，或便利店 App"),
    ("鲜椒肉棒 / 孜然牛肉", "包装", "超市同类包装，或便利店 App"),
    ("香煎三文鱼（鱼糜制品）", "包装", "超市同类包装，或便利店 App"),
    ("鱼籽烧 / 鱼籽仙贝", "包装", "超市同类包装，或便利店 App"),
    ("章鱼烧", "包装", "超市同类包装，或便利店 App"),
]
