# data-sources

营养数据的来源文件和核对记录。App 实际读取的是 `src/foods.json`，它由脚本生成，不手改数字。

| 文件 | 内容 |
| --- | --- |
| `raw/` | 原始数据（USDA 整包 CSV、日本成分表 Excel）。不进 Git，用 `fetch-nutrition-sources.cmd` 下载 |
| `manifest.json` | 每个原始文件的下载地址、大小、SHA-256 和下载日期 |
| `source-values.json` | 每种食物的数值来自哪个条目（FDC ID / 食品番号）、配方用量和交叉核对结果 |
| `pending.csv` | 还在等数据的食物：等中国食物成分表，或等包装标签 |
| `food-list-draft.xlsx` | 2026-10-16 审阅过的食物清单（保留、改名、删除、新增） |
| `source-check.xlsx` | 2026-10-16 审阅过的来源核对表 |

## 重新生成

```bash
fetch-nutrition-sources.cmd                    # Windows 双击；或 node scripts/fetch-nutrition-sources.mjs
pip install openpyxl
python scripts/nutrition/build_catalog.py      # 按 scripts/nutrition/catalog_spec.py 更新 src/foods.json
python scripts/nutrition/build_oden_icons.py   # 新增关东煮条目的图标图片
npm run test:data
```

改数据时只改 `scripts/nutrition/catalog_spec.py`：来源条目、配方、等级、说明、删除和改名都在里面。

## 出处

- USDA FoodData Central（SR Legacy 2018-04、Foundation Foods 2026-04-30），公共领域（CC0）。
- 日本食品標準成分表（八訂）増補2023年から引用（文部科学省）。
