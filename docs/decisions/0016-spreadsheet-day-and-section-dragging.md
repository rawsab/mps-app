# 0016 — Spreadsheet day and section dragging

Date: 2026-11-16 · Status: requested by the owner

## Decision (FR-06, NFR-06)

- Normal dragging from a Day cell moves its complete day; dragging from Section moves that section and all exercises. Dragging #–Notes continues to move exercises. Shift-drag and Shift-click retain rectangular selection. This supersedes decision 0015's ordinary selection dragging from Day/Section cells.
- Sections can be reordered around other sections or appended to a day by dropping on its Day cell. Empty sections and days remain draggable destinations/sources. Days can be reordered around other days or appended to a week by dropping on its header, including empty weeks.
- All structure moves preserve stable subtree identities and prescriptions and use a single reversible command. Destination-aware insertion markers, source dimming, edge scrolling, cancellation and focus following extend the existing row-drag behavior. The on-screen gesture description names all three types.
- Changed day numbers briefly blur/fade out (100ms), then the new numbers blur/fade in (220ms). A single short-lived map retains previous numbers through the committed reorder, including moves between weeks. Reduced-motion preferences show the new numbers immediately. Screen readers receive only the current number.

## Verification

- Targeted spreadsheet suite: 32 tests passed. Four added cases cover section reordering, section moves to empty/other days, day ordering/derived numbers with Undo/Redo, empty-week destinations and stale/no-op moves.
- Production build/typecheck passed. No browser checks or screenshots. Manual check: drag sections within/across days, reorder days and observe the number transition, drop into empty destinations, verify Shift selection and Undo, and reduced motion.
