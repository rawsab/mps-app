# 0034 — Nutrition program weight units

Date: 2026-11-17 · Status: implemented, manual UI verification pending

- FR-09/10: Coach Program details now includes a Weight unit selector, lb or kg, using the existing SelectField. It autosaves with the private draft; publishing shares the choice with clients. Existing and new programs default to lb.
- The selected unit applies to daily entry, editable/copyable spreadsheet weights, rolling averages, weekly weight values, baseline predictions and mesocycle statistics. Predictions still use 3,500 kcal per lb, converted to the selected unit.
- Switching units converts displayed measurements without rewriting historical client/date logs. New edits store their explicit unit; overlapping programs can display the same measurements in different units. Changing the unit resets the sheet’s unit-dependent undo history once existing edits have been saved.
- Migration 29 adds the unit to immutable program revisions and extends the existing authorized draft writer. Existing RLS and published-revision immutability apply unchanged.
- Verification: typecheck, 278 unit tests, production build, and 99 targeted database assertions for lifecycle, coach editing and weight units. Local migration applied. Existing bundle-size warning remains. No browser automation or screenshots.

Manual checks:

1. In Edit program → Program details, select kg, wait for Saved, then reload. Confirm the selection and existing weights/averages convert correctly.
2. Publish, then check the client’s daily weight label, spreadsheet and stats use kg. Enter a weight and confirm it persists in kg.
3. Switch back to lb and publish; verify the same measurements convert correctly and coach-edit markers remain visible.
