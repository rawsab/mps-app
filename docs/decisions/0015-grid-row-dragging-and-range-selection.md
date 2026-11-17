# 0015 — Grid row dragging and rectangular selection

Date: 2026-11-16 · Status: requested by the owner

## Decision (FR-06)

- Normal mouse/pen dragging from any displayed cell from # through Notes moves its exercise row. Shift-drag selects a rectangular range; selecting a cell then Shift-clicking another extends the rectangle from the original anchor. This supersedes the normal-drag selection gesture in decision 0010. Day and Section cells retain range-selection dragging. Native editors and touch scrolling retain their interactions.
- Row drops insert before/after a target exercise within its section, including other existing sections, days and week sheets. Supersets move together and drops outside target supersets preserve their grouping. Empty sections/days have explicit drop destinations; moving to a day with no sections creates its Main section in the same batch.
- Pointer capture, a gold insertion marker, source-row dimming and viewport/page edge scrolling provide drag feedback. Escape, cancellation or dropping outside a destination makes no edit. Every move retains exercise/history identities and prescriptions, recalculates # from section position, and uses one reversible batch. Focus follows the moved row.

## Verification

- Targeted weekly-grid suite: 27 tests passed. Six new cases cover reordering/numbering, superset moves and undo/redo, cross-day/week moves with identity/prescription retention, empty destinations, target-group boundaries/no-op drops and stale targets.
- Production build/typecheck passed. No browser checks or screenshots. Manual checks: normal drag from #, name and Notes; moves within/across sections and days; empty destinations; Shift-drag/Shift-click rectangular selection and Delete/Undo; Escape and edge scrolling.
