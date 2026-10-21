# Calorie Compass v2.8 Agent Guide

## Product decisions

- v2.6 keeps the v2.5 mobile-first UI, information architecture, visual styling, navigation, comparison screen, and bilingual behavior.
- The Windows application mounts that UI directly in a frameless app canvas. Do not restore the phone bezel, status bar, home indicator, device picker, custom cursor, or simulated keyboard.
- Do not redesign v2.1 into a desktop sidebar/table application.

## Versions and git

- Versions are git commits and tags in this repository (`v2.7.0`, `v2.8.0`, …). Do not create new versioned copies of the project folder.
- `APP_VERSION` in `src/userData.ts` must equal `version` in `package.json` (a test checks this); the portable build name and output folder in `package.json` follow the same version.
- Do not push to GitHub unless the owner asks for it.
- The `.git` folder was created by another Windows account (the Codex sandbox), so git reports "dubious ownership" for the owner's own account. Trust exactly this folder with `git config --global --add safe.directory <path>`; do not use `safe.directory=*`.

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
- Storage keys live in `src/userData.ts` (`STORAGE_KEYS`). Never rename them; they keep their historical version suffixes on purpose. v2.8 added `calorie-compass-v2.8-profile` (body data), `-favorites` and `-portions` (compare mode, portion sizes, oden piece weights).
- My Data offers backup export/import (`src/userData.ts`). Imports replace data only after validation and user confirmation. Keep the backup format backward compatible; bump `BACKUP_VERSION` only with a migration.
  - v2.8 backups carry an optional body profile (only a complete one is exported or imported) and always carry favorites and portion settings, possibly empty. Backups made before v2.8 have none of these, and importing them keeps what the device has.
  - Stored entries keep fields this version does not know (`{ ...raw, ...validated }`), so data written by a newer version survives a round trip.
- Workout entries store `modelVersion`. Entries without it were made before v2.8; their numbers were placeholders and the owner decided they are dropped (and counted in the import summary). Entries with a newer `modelVersion` are kept as saved and shown read-only; never recompute them with an older model. An entry whose exercise is no longer in the library keeps its saved numbers until the user picks another exercise.

## Code layout

- `src/Prototype.tsx`: providers and screen navigation only.
- `src/app/`: shared copy, cooking methods (`METHODS` / `METHOD_PREPARATIONS`), food store helpers and small UI parts.
- `src/screens/`: one file per screen (home, lookup, food detail, compare, favorites, my data, converter). `src/PlanScreens.tsx` and `src/planner.tsx` hold the weekly plan.
- `src/features/`: portion calculator, "use this data", favorites and comparison by portion (`UserPrefsContext`).
- `src/workout/`: exercise library, energy model, body profile, form state, copy and UI of the workout estimator.
- `src/mobile/` is the hash-locked v2.1 runtime (`mobile-runtime.lock.json`). Never edit it or the other locked files (`src/App.tsx`, `src/main.tsx`, `src/styles.css`, `vite.config.ts`, the runtime scripts). The failure message of the locked `scripts/check-mobile-runtime.mjs` still says to put UI in `src/Prototype.tsx` and `src/prototype.css`; that predates the v2.8 split and means "anywhere outside the locked files".

## Lookup and portions

- Cooking-method tiles are defined in `src/app/methods.ts`. Tiles without foods are hidden automatically; add data rather than empty tiles.
- The braise (卤·炖) and oden lists show a one-line salt tip; sodium is not tracked per food.
- Oden items (except the broth) are counted per piece; the default piece weight is the record's serving and the user can change it. A meal added from the calculator keeps its piece weight (`MealEntry.pieceGrams`).

## Workout estimator (model v2, `src/workout/model.ts`)

- The model is pure and documented in its header. Strength work: mechanical work (load + lifted share of body mass) ÷ muscular efficiency, split in time by oxygen-uptake kinetics into during-set, between-set and post-exercise parts. Cardio: ACSM equations or 2024 Compendium METs, minus the person's own resting metabolism (Mifflin–St Jeor), plus EPOC by intensity.
- Owner's rules: when the rest between sets is entered, recovery between sets and resting metabolism for the session are counted and the headline is the total; when it is not, only the training part is shown and the card says what is missing. Post-exercise recovery is always counted. RPE and average heart rate are optional advanced inputs and are used only when entered; never double-count a signal.
- Ranges reflect the spread between studies and people; they are not statistical intervals, so copy must not call them "80 % intervals".
- `tests/workout-model.spec.ts` asserts that published measurements (Scott 2012/2014, Dudley 1991, Brown 1994, Nakagata 2022, Vezina 2014) lie inside the model's ranges. Keep them inside when changing efficiency bounds or exercise geometry.
- The form rejects values outside `INPUT_LIMITS` (`draftProblems`) instead of letting the model clamp them, and keeps the last valid result visible (dimmed) while a value is being fixed.
- Raise `WORKOUT_MODEL_VERSION` when a change alters stored numbers in a way older apps must not recompute.

## Editing and verification

- `desktop/main.cjs` owns the resizable 460 × 860 default Windows window, the `app://` protocol and the `--verify-output` self-check.
- `npm run build` prunes food images the app does not reference (`scripts/prune-unused-assets.mjs`); source images in `public/` are untouched.
- Before handoff run `npm test` (runtime lock, data, Sites, Playwright web tests) and `npm run test:desktop` (Electron: restart persistence, protocol safety, startup errors).
