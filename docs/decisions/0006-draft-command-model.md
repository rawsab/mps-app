# 0006 — Draft command model

Date: 2026-11-16 · Status: accepted

## Decision

- **One command set for every editor.** `src/domain/programs/commands.ts` defines the only way the Program view, the Grid view and reviewed import edits change a `ProgramDraft` (roadmap §7, FR-05, FR-06). Commands address nodes by stable id: field updates per node kind, `setSetCount`, `updateTarget`, `setTargets`, `insert`, `move` (reorder or reparent), `duplicate` and `remove`. Targets have no id, so they are addressed by exercise id and position.
- **Pure and DOM-free.** `applyCommand` returns a new draft or a typed error (`not_found`, `invalid_parent`, `invalid_index`, `duplicate_id`, `invalid_value`) with a document path in the same format as `validateForPublish`. The input is never mutated. Untouched nodes are shared, so editors can keep snapshots for undo cheaply and memoize rows.
- **Every result is contract-valid.** Patches are validated with `.strict()` picks of the contract schemas, prescriptions are re-checked against `ExercisePrescription`, and inserted nodes are parsed and checked for id collisions. Drafts can still be incomplete (no set count), but never malformed.
- **`applyCommands` is all-or-nothing** and reports the failing command index. A Grid rectangular paste is one batch, so a bad cell rejects the paste instead of shifting neighbours.
- **Semantics:**
  - `logicalKey` can't be patched. Renames keep the history key, and copies keep it so progress follows the same movement.
  - Duplicates go right after the original with fresh ids throughout (including alternatives). Group ids inside a copied week/day/section are remapped so the copy's groups don't merge with the original's; a single duplicated exercise stays in its group. Copied weeks and days lose their dates.
  - Structural week changes renumber `index` 1..n, which `save_draft` requires to ascend. Labels are left alone.
  - `setSetCount` resizes per-set targets: added sets copy the last target, removed sets drop theirs. Uniform targets are unaffected.
  - New nodes get `crypto.randomUUID()` ids (decision 0004). Tests inject `newId`.

## Consequences

- Persistence is unchanged: editors apply commands locally and save the whole document with `save_draft` (decision 0005). On a stale-version conflict the editor can replay its pending commands onto the newer draft or keep its document for review.
- Importer ids (`w1d1s1e1`, …) aren't uuids, so `save_draft` would reject an imported draft as-is. The import commit path (M7) must re-key nodes before saving.
- Undo/redo isn't built yet; snapshot history over shared structure is the intended approach.
