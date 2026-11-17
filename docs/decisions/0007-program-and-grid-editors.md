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

## Grid workflow refinements (2026-11-16)

- The 28px-high, full-width `+` tab is attached to the bottom edge of the visible table, outside the horizontal scroller. It appends an exercise to the final section and focuses its name. If the final workout has no structure, the missing week/day/main section are inserted in the same batch. Programs containing only shared sections append there. Placeholder exercises have distinct history keys.
- Per side, Load mode and Unit use dropdowns. Existing mixed per-set values remain visible as a selected option; choosing a uniform option applies it to all sets. Incomplete mode/value/unit choices stay buffered with validation until the dependent field completes a valid row; no unit or zero is invented.
- Horizontal overflow uses a non-interactive edge gradient only. It is measured on load, resize and scroll, and fades out over 200ms when the corresponding edge is reached, fading back in when more columns are available. Reduced motion disables the transition. Its theme token shades toward ink in dark mode and keeps a subtle text-color shadow in light mode. The explanatory paragraphs and the “More columns” button are removed.
- Both views share Undo/Redo buttons and draft-level shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y outside text controls). One accepted batch, including paste and row insertion with any scaffolding, is one undo step. The last 100 operations are retained during the editing session, across autosave and view switches. New edits clear redo. Reload, publish, recovery restoration and conflict rebase start a new history.
- `applyReversibleCommands` produces inverse batches using the existing command set. It restores removed subtrees and truncated per-set targets exactly. Duplications are recorded as concrete inserts with the generated ids, so redo and conflict replay preserve descendant ids. Undo/redo are new draft edits through the normal autosave and version checks, never a rollback of a published revision or client result.
- Grid’s **Add…** dialog creates named weeks, days in a chosen week, and typed sections in a chosen day or across all days. Each includes an initial exercise, focused for editing, so the new structure is immediately visible. The entire creation is one undoable command batch; adding a day to an empty program creates its week too.
- Duplicate day/week and Remove day/week are cell context-menu actions, removed from the Grid toolbar. The right-clicked cell supplies the target day/week. The menu also opens with Shift+F10 or the context-menu key, supports arrow navigation and Escape, and stays within the viewport outside the table’s clipping container. Shared rows disable these actions; removal still uses confirmation and the existing undo/save path.
- User preference: browser automation and screenshot analysis require explicit permission. Future UI verification is manual by default, with a brief checklist supplied to the user.
