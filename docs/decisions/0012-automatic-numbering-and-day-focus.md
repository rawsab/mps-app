# 0012 — Automatic week/day numbering and optional Focus

Date: 2026-11-16 · Status: requested by the owner

## Decision (FR-05, FR-06)

- Weeks display as Week 1, Week 2, etc. Days display as Day 1, Day 2, etc., restarting in each week. Numbers derive from current array order, so adding, duplicating, removing, reordering or moving items updates their displayed numbers automatically. Numbering does not depend on old imported headings or indexes.
- Remove week/day rename controls and week-heading pencils in both editors and creation dialogs. Program view edits an optional Focus field for each day. Grid's merged Day / Focus cell shows the generated day number above its Focus, editable through double-click, Enter/F2 or typing. Clearing the cell clears Focus, while the generated day number remains.
- Keep the existing day `label` storage key as the backward-compatible representation of Focus. A shared formatting helper strips legacy week/day prefixes when exposing it, preserving descriptions such as Legs, Pull or Push. Existing saved/imported headings and all published documents are left untouched; subsequent Focus edits store the new descriptive text through the existing `updateDay` command and autosave path.
- Focus is optional and is not a publish requirement. Migration 00008 updates the server validator accordingly. Required section titles, exercise names, prescriptions and other publish checks remain enforced. This supersedes the day-name requirement in decision 0011 and the rename controls in decision 0010.
- Navigation, creation dialogs, destination selectors and context actions use the same automatic numbering and optional descriptive Focus.

## Verification

- All 171 unit tests, typecheck and production build pass. Coverage includes legacy heading extraction, numbering from order, renumbering after remove/reorder, Focus following stable day ids, and clearing Focus without changing the generated day number or blocking publication.
- Local migration 00008 applied without a reset. All 20 database assertions pass, including successful publication with empty Focus and continued rejection of missing section/exercise names.
- No browser automation or screenshots ran. Manual checks: add/duplicate/remove/reorder weeks and days; edit/clear Focus in either editor and switch views; inspect numbered headers, navigation and destination selectors.
