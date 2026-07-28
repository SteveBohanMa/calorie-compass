# Calorie Compass v2.5 Agent Guide

## Product decisions

- v2.5 preserves the original v2.4 mobile-first UI, information architecture, visual styling, navigation, comparison screen, and bilingual behavior while making weekly planning fully editable.
- The Windows application mounts that UI directly in a frameless app canvas. Do not restore the phone bezel, status bar, home indicator, device picker, custom cursor, or simulated keyboard.
- Do not redesign v2.1 into a desktop sidebar/table application.
- The initial 50 canonical v1 food records must remain present while the bundled offline catalog expands substantially. Image precision is more important than retaining low-confidence catalog rows.
- Each food record owns an exact, fixed local image reference and one primary nutrient classification. Quick-lookup food and cooking-method images must never be fetched at runtime. Do not use generic chicken/steak fallback mapping.
- Food photos use natural close-up food photography matching the user-provided reference. Keep only visually reviewed web photos; use locally bundled generated photos when a web result is not precise.
- My Data supports local add, edit, and delete for custom dishes. Calorie Compare supports user-selected catalog and custom dishes, including direct addition from food details.
- Weekly meal and workout plans are editable, persist locally, aggregate by day/week, and export as PNG.
- Energy conversion supports both kcal-to-kJ and kJ-to-kcal input.
- Food search, quick categories, method lists, details, and comparison continue to use the v2.1 flows while displaying canonical per-serving and per-100-g values.
- Workout estimation keeps the v2.1 screen style but includes exercise, body weight, sets, reps, load, and optional duration, tempo, rest, RPE, and average heart rate.
- Workout results show gross session energy and extra energy above rest as ranges. Inferred duration must be labeled, and RPE/heart-rate signals must not be double-counted.

## Editing and verification

- App UI remains in `src/Prototype.tsx` and `src/prototype.css`.
- `src/mobile/` remains the v2.1 runtime; only the explicit frameless mode may differ from the original phone preview.
- `desktop/main.cjs` owns the resizable 460 × 860 default Windows window.
- Run the runtime integrity check, TypeScript/Vite build, Sites tests, and packaged Electron verification before handoff.
