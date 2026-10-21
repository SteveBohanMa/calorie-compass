# Calorie Compass v2.7 Agent Guide

## Product decisions

- v2.6 keeps the v2.5 mobile-first UI, information architecture, visual styling, navigation, comparison screen, and bilingual behavior.
- The Windows application mounts that UI directly in a frameless app canvas. Do not restore the phone bezel, status bar, home indicator, device picker, custom cursor, or simulated keyboard.
- Do not redesign v2.1 into a desktop sidebar/table application.

## Data honesty (v2.6, sourced data since v2.7)

- Never show a number that is not real data. Hiding a value is better than showing a wrong one.
- `src/foods.json` is generated: edit `scripts/nutrition/catalog_spec.py` and run `python scripts/nutrition/build_catalog.py` (needs openpyxl and the raw files from `fetch-nutrition-sources.cmd`). Do not hand-edit numbers in `foods.json`.
- Sources: USDA FoodData Central (SR Legacy / Foundation, public domain) and 日本食品標準成分表（八訂）増補2023年 (MEXT; cite "日本食品標準成分表（八訂）増補2023年から引用"). The China Food Composition Tables (6th ed.) are copyrighted; use them only while the repository is private. FatSecret data must never be bulk-copied or scraped (its terms forbid it); users enter it themselves.
- Every visible record has grade A (source has this cooking method), B (similar method or a simple recipe of sourced components) or C (varies by brand; check the label), all four nutrients, and a `Source` naming the database and item code. `npm run test:data` enforces this and rejects nutrients that do not match the calories.
- Hidden records: `"DataStatus": "placeholder"` (category defaults, legacy) and `"pending"` (waiting for the China tables or package labels; see `data-sources/pending.csv`). `src/catalog.ts` filters both out.
- The initial 50 canonical v1 records (f001–f050) must stay in the catalog; one may be `pending` while it waits for a source, never deleted or a placeholder.
- Each food record owns an exact, fixed local image reference and one primary nutrient classification. Quick-lookup food and cooking-method images must never be fetched at runtime. New oden records use generated Noto Emoji pictures (`scripts/nutrition/build_oden_icons.py`) until photos exist.

## User data and storage

- The desktop app serves the UI from the fixed origin `app://calorie-compass` (`desktop/main.cjs`). localStorage is keyed by origin, so never change the scheme or host and never go back to a random localhost port (v2.5 lost all user data on every restart because of that).
- Storage keys live in `src/userData.ts` (`STORAGE_KEYS`). Never rename them; they keep their historical version suffixes on purpose.
- My Data offers backup export/import (`src/userData.ts`). Imports replace data only after validation and user confirmation. Keep the backup format backward compatible; bump `BACKUP_VERSION` only with a migration.
- Keep `APP_VERSION` in `src/userData.ts` equal to `package.json` (a test checks this).

## Lookup

- Cooking-method tiles are defined in `METHODS` / `METHOD_PREPARATIONS` (`src/Prototype.tsx`). Tiles without foods are hidden automatically; add data rather than empty tiles.
- The braise (卤·炖) and oden lists show a one-line salt tip; sodium is not tracked per food.
- Workout estimation includes exercise, body weight, sets, reps, load, and optional duration, tempo, rest, RPE, and average heart rate. Results show gross session energy and extra energy above rest as ranges. Inferred duration must be labeled, and RPE/heart-rate signals must not be double-counted.

## Editing and verification

- App UI remains in `src/Prototype.tsx` and `src/prototype.css`. `src/mobile/` is the hash-locked v2.1 runtime.
- `desktop/main.cjs` owns the resizable 460 × 860 default Windows window and the `app://` protocol.
- `npm run build` prunes food images the app does not reference (`scripts/prune-unused-assets.mjs`); source images in `public/` are untouched.
- Before handoff run `npm test` (runtime lock, data, Sites, Playwright web tests) and `npm run test:desktop` (Electron: restart persistence, protocol safety, startup errors).
