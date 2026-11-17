# 0036 — Client program spreadsheet

Date: 2026-11-17 · Status: implemented, manual UI verification pending

- FR-06/FR-07: Client training pages (mesocycle and personal training) get Workout / Spreadsheet tabs. `view=sheet` in the URL keeps the choice across reloads; week and day selection are kept when switching.
- The spreadsheet is read-only and shows the selected week, plus the every-workout preparation sheet when the program has one. It reuses the coach grid's columns (`gridColumns`), cell text (`cellText`) and merged Day/Section cells (`gridRowSpans`), so both views read the same published targets. Column widths moved to `gridTableLayout.ts` and are shared with the coach grid.
- It shows prescriptions only, never logged results. It reads the current published revision; a started mesocycle session keeps its own snapshot in the Workout tab, and the sheet says so.
- Coaches see the same tabs on the client log page. No database, permission or dependency changes.
- Verification: typecheck, 282 unit tests and production build passed. No browser automation or screenshots.
