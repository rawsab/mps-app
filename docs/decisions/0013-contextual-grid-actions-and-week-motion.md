# 0013 — Contextual grid actions and week motion

Date: 2026-11-16 · Status: requested by the owner

## Decision (FR-05, FR-06, FR-11, NFR-01, NFR-06)

- Remove the Move exercise and Add buttons above each grid, and the Add button next to Training spreadsheets. Keep movement in the cell context menu and creation in the attached + tab.
- Context menus use compact 32px rows and icons for every option. Insert row above/below follows the clicked column: Day creates a day in its week, Section creates a section in its day, and other columns create an exercise in its section. New days/sections include a blank starter exercise so they are immediately editable in the grid. Each insertion is one undoable command.
- Each week has a right-aligned three-dot menu: Duplicate week, Delete week, Move up and Move down. Boundary movements are disabled. Duplication appends a subtree with fresh ids and the next positional number, scrolls to it, and fades a 7% gold highlight. Deletion requires confirmation and collapses the sheet. Layout transitions animate reordered/remaining weeks; displaced weeks fade during their slide. Reduced-motion preferences disable these animations and smooth scrolling.
- Grid navigation aligns the selected day near the top. Publish issue links scroll smoothly to the relevant field, retaining Grid view when the destination has a grid cell. Invalid grid cells use a red surface/border and a native hover tooltip, with the error text retained for assistive technology.
- Client settings and all editor disclosures use the shared rotating chevron. Remove the Program outline heading. Add warning icons to publish issues/count, plus icons to program creation options, left padding to program links, and Pause/Resume/End icons.
- Staff may delete notes they authored, after confirmation. Migration 00009 requires both authorship and current client access in the delete policy. Notes retain staff-only read access; clients cannot delete them.

## Verification

- Targeted grid suite: 21 tests passed, including sibling insertion above/below and exact undo for all three scopes, and appended week duplication with fresh ids, retained history keys and exact undo.
- Targeted note database suite: 18 assertions passed. Migration 00009 applied locally; no database reset.
- Production build/typecheck passed; the existing bundle-size warning remains. Subsequent navigation refinements passed typecheck. No browser automation or screenshots, per owner preference.
- Manual checks: contextual insertion in merged cells; week duplicate/reorder/delete animations and Undo; issue scrolling and hover errors; note deletion; chevrons and both themes/reduced motion.
