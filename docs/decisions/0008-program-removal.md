# 0008 — Program, week and day removal

Date: 2026-11-16 · Status: accepted

- **Unpublished programs can be deleted.** The client's Programs card provides a confirmation that deletes the whole unpublished program and its draft hierarchy (FR-04). `remove_program` requires staff access and the draft version captured when confirmation opens. Stale versions return `PT409`, preserving the program for review.
- **Published programs are archived.** The card uses an explicit Archive action and explanation for programs with published revisions. The database refuses hard deletion if any published revision exists, even for an admin. Archive requires the same `can_publish` permission as publishing (PRD §4). It preserves the current revision pointer, all content and history, and makes the editor read-only; existing save/publish functions reject archived programs. No direct browser table-write grants were added.
- **Serialize removal with save/publish.** The function locks the program row before checking the draft version and history. A publish or save that wins the lock first must be reflected in the removal's version/history checks.
- **Weeks and days are draft edits.** Both Program and Grid expose confirmed removal, using the existing stable-id `remove` command and shared autosave. Removing one removes its descendants from the draft; published revisions are untouched. Empty days/weeks can be managed in Program view, since Grid rows represent exercises.
- All new function grants and permission/history tests ship in migration `20261116000006_remove_program.sql` and `006_remove_program.test.sql` (16 assertions). Audit events remain M3 step 6.
