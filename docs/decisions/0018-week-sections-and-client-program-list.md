# 0018 — Week section grouping and client program list

Date: 2026-11-16 · Status: implemented

## Decision

- Section grouping is a per-week presentation setting named **Use sections**, defaulting to off. Week settings and each day page edit the same week-level value. The Spreadsheet week menu exposes the same toggle; when disabled, that week's Section column is hidden. In List View, exercises render directly beneath each day while grouping is off. Existing section data is retained.
- The info control beside Use sections shows a short description on pointer hover and keyboard focus.
- List View exercise headers are native drag sources. Dropping on another exercise places the row before or after it; dropping on a section or day moves the exercise there. Superset members move together through the shared grid row-move planner.
- The client Programs card filters by All, Mesocycle, Personal Training and Nutritional. Each row has a service icon. Programs are ordered by the newest revision `updated_at`, falling back to program creation time. The Nutritional option is ready for the separate nutrition model; the current workout-program query does not return nutrition records.
- On the week settings page, workout-day labels show the derived day number in muted text and the focus in darker text, followed by a divider after the last day.

## Verification

- TypeScript typecheck and `git diff --check` passed. No tests or browser checks were run for this change set.
