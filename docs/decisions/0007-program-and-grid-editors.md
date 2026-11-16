# 0007 — Program and Grid editors

Date: 2026-11-16 · Status: accepted

## Decision

- **The Grid is a pure model first.** `src/domain/programs/grid.ts` turns cell text into draft commands. It is DOM-free and unit-tested (`tests/domain/programGrid.test.ts`). Rows are exercises, including program-wide shared sections. The columns are fixed and typed: Day, Section and # (read-only), then Exercise, Sets, Reps / time, Per side, Load mode, Load, Unit, RIR, RPE and Notes (FR-06).
- **Row-level rebuild.** `planEdits` groups the edited cells by exercise, rebuilds each row from its current values plus the edits, and returns one command batch (`updateExercise` + `setPrescription`). Mode, value and unit therefore combine correctly whether they arrive one at a time or in one paste. A new `setPrescription` command replaces set count and targets together, so a row whose sets and per-set list both change never passes through an invalid state.
- **All or nothing.** Any bad cell returns per-cell errors and no commands. A paste that runs past the grid's edge is an error; cells are never dropped or shifted. Pasting identical text over read-only cells is allowed (copy a block, paste it back); changing it is not.
- **Notation:**
  - Per-set targets display as `10 / 8 / 6`. One value applies to every set; a list must have one value per set, and with uniform targets it expands only when it matches the set count.
  - `45s`, `30-45 sec` and `2 min` are durations; plain numbers or ranges are reps. RIR `1-2` stays a range; anything date-like is rejected.
  - A number in Load with no mode means a weight (`external`). The unit is never guessed: blank means unknown (PRD §10).
  - Weight and assisted keep each other's value when switching modes; other mode changes need a new value.
  - Null (blank) and zero stay distinct.
- **Grid-invisible fields are preserved.** Annotations, alternatives, groups, demo links and section instructions are edited in the Program view. The grid never touches them.

- **One editor state for both views.** `src/features/programs/useDraftEditor.ts` holds the canonical draft, the commands pending since the last confirmed save, the base `lockVersion` and the save state (`saved`, `unsaved`, `saving`, `error`, `conflict`). Both views change the draft only through `dispatch(commands)`. Autosave sends the whole document about 1 s after the last change. Program-view fields that are also grid columns commit through `planEdits`, so notation and messages are identical in both views.
- **Edits are never dropped silently (roadmap M3 task 6):**
  - Refused field or cell text is kept in the editor (`rejected`, keyed `exerciseId:column` for shared fields), so it survives switching views. Escape discards it.
  - A failed save keeps the edits and offers Retry; the next edit retries too.
  - A stale version (`PT409`) becomes a conflict. Nothing is written until the coach chooses: replay my pending commands onto the latest draft; replace theirs with mine (an explicit save at the server's current version); or discard mine.
  - Unsaved work is mirrored to `localStorage` (`mps.draft-recovery.<programId>`) and offered for restore after a reload. It's cleared once saved. It contains program content, but no secrets.
  - `useBlocker` and `beforeunload` ask before leaving with unsaved or refused edits.
- **Publish** saves pending edits first, then calls `publish_revision` with the saved `lockVersion`. `PT422` problems replace the local readiness list until the next edit.
- **Routes:** `/coach/clients/:clientId/programs/:programId`, with `?view=grid` for the Grid. The client page's Programs card creates a program per active training enrollment.

## Consequences

- Reordering isn't a grid cell edit (pasting into # would make positions ambiguous mid-batch). It's a row action.
- Mixed per-set values in mode, unit or per side show as a list. Typing one value sets every set.
