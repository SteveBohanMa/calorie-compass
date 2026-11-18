# Calorie Compass v2.10 Agent Guide

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

## Android app (v2.9)

- Capacitor 8 wraps the same web build (`dist/client`) into an Android app. `capacitor.config.json` holds the app id `io.github.stevebohanma.caloriecompass`, the name and `server.androidScheme: "https"` / `hostname: "localhost"`. Never change the app id or the scheme/hostname: Android identifies the installed app by its id, and localStorage is keyed by the `https://localhost` origin, so either change loses the phone's data.
- Build on Windows with `build-android.cmd` (`scripts/android/build-android.mjs`, log in `build-android.log`). Tools live in `%LOCALAPPDATA%\CalorieCompassAndroid`; Gradle runs on a copy in an ASCII-only folder there because Android's build tools fail in paths with Chinese characters. Output: `release-vX.Y-android/CalorieCompass-vX.Y.Z.apk`.
- `android/` is generated once by `npx cap add android`; `scripts/android/customize-android.mjs` (run by every build, idempotent) writes the version (`versionCode = major*10000 + minor*100 + patch`), release signing, icons, theme, `MainActivity`, the file plugin and the Health Connect plugin (v2.10) from `scripts/android/native/` and `scripts/android/res/`. Edit those templates, not the copies in `android/`.
- Signing: the release key is created once in `../android-signing/` (outside the repository). Every update must be signed with it or Android refuses to install over the old app (uninstalling deletes the phone's data). Never commit it, never regenerate it.
- `src/native/bridge.ts` (pure, tested in `tests/android.spec.ts`) gives the Android app the same `window.calorieCompass.exportReport/exportBackup` contract as the Windows preload: backups go to `Download/燃卡快查`, weekly report images (a PixelCopy of the on-screen rectangle) to `Pictures/燃卡快查`. `src/native/android.ts` wires it to Capacitor and does nothing on Windows or in a browser.
- The Android back button/gesture closes registered overlays first (`useNativeBackOverlay`: exercise picker, dish form, import question), then pops the screen stack (`NativeBackFlow` in every header and the home footer), then moves the app to the background.
- `html[data-native-platform="android"]` (set by `src/native/android.ts`) scopes phone-only CSS in `src/prototype.css`. On a phone everything is tapped: Playwright phone tests must use `tap()`, because with touch emulation Chromium does not turn mouse clicks into clicks on these screens.

## Health Connect (v2.10, Android 14+)

- `scripts/android/native/CalorieCompassHealthPlugin.java` and `HealthConnectAccess.java` use the Health Connect API built into Android 14 (`android.health.connect`, API 34). No third-party plugin and no Jetpack library: minSdk stays 24, and on Android 7–13 the plugin reports `android-version` and the app keeps manual entry. Keep `HealthConnectAccess` free of anything that older Android versions would load (only `CalorieCompassHealthPlugin` touches it, after the SDK check).
- `HealthPrivacyActivity.java` (text in `scripts/android/res/values*/cc_health.xml`) is the privacy page Health Connect requires: without the activity alias for `VIEW_PERMISSION_USAGE` / `HEALTH_PERMISSIONS` the system grants no health permission. `customize-android.mjs` writes that activity, the alias and the six health permissions between `calorie-compass:health` markers in the manifest.
- Pure decisions are in `src/health/core.ts`, the checked plugin wrapper in `src/health/api.ts`, state and write-back in `src/health/HealthContext.tsx`, the screens in `src/health/HealthViews.tsx`; `tests/health.spec.ts` covers them. Tests install a fake plugin as `window.__calorieCompassHealthPlugin` before the app starts; nothing sets it in the apps.
- Owner's rules:
  - Heart rate is read automatically only for strength exercises and resistance sessions (circuit, strength session), never for cardio: the project is about the energy of anaerobic training. A workout another app recorded that is ongoing or ended at most 2 h ago gives its average heart rate; otherwise the newest sample of the last 5 minutes (older means "no data"). The source is shown, the value stays editable, and a typed value is stored as `hrSource: "manual"`. Too few samples are not judged in this version.
  - Permissions are asked per feature when it is first used (heart rate from the estimator or My Data; weight, resting heart rate and write-back by their switches in My Data). Refusing keeps manual entry.
  - Weight only offers an update of the body data, never overwrites it. Resting heart rate is shown in My Data only and not used in calculations.
  - Write-back is off by default. Each exercise ticked as done becomes one `ExerciseSessionRecord` plus one `ActiveCaloriesBurnedRecord` (kcal = the entry's midpoint extra energy), with client record ids `<entry id>#session` / `#active`; nothing is written when another app has a workout overlapping that time. Unticking or deleting the exercise deletes its records. The end time is `recordedAt` (added from the estimator) or else `completedAt` (ticked) and must fall on the entry's day. Only workouts ending after the day write-back was turned on are written for the first time.
- Workout entries gained optional `recordedAt`, `completedAt`, `hrSource`, `hrFrom`, `hrTo` (sanitized in `src/userData.ts`; entries without them read as before, so no `WORKOUT_MODEL_VERSION` change). `calorie-compass-v2.10-health` (settings) and `calorie-compass-v2.10-health-sync` (what was written) describe this phone and are not part of backups.

## Editing and verification

- `desktop/main.cjs` owns the resizable 460 × 860 default Windows window, the `app://` protocol and the `--verify-output` self-check.
- `npm run build` prunes food images the app does not reference (`scripts/prune-unused-assets.mjs`); source images in `public/` are untouched.
- Before handoff run `npm test` (runtime lock, data, Sites, Android build helpers, Playwright web tests including the phone-size checks) and `npm run test:desktop` (Electron: restart persistence, protocol safety, startup errors). For Android changes also run `build-android.cmd` and check the APK on a phone.
