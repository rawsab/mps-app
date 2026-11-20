# 0045 — Restoring and permanently deleting archived programs

Date: 2026-11-20 · Status: implemented (owner request), manual UI verification pending · Extends 0038

- **Owner request:** archived programs in the client's Programs list get the same ⋯ menu as live ones, with **Restore** and **Delete**. Delete removes the data and hides the program completely.
- **Discrepancy, recorded rather than resolved silently.** The roadmap makes published revisions immutable (FR-04, FR-06, NFR-01). Like 0038's service deletion, this lets an administrator delete published history on purpose. It reuses 0038's transaction-local `mps.purging_programs` flag, which the guards honour for DELETE only, so published content still can't be edited.
- **Restore (`restore_program`, migration 00044):** clears `archived_at`, under the same permission as archiving (`staff_can_publish_for_client`). The program's service must still be live; a program of an ended or archived service stays archived, and the menu shows "Restore (service ended)" disabled. A restored program becomes a current-program candidate again (decision 0039). Restoring again does nothing.
- **Delete (`delete_archived_program`, migration 00044):** admins only, and only for archived programs (live drafts keep `remove_program`). It removes the program, every revision and its content, and the client's logged workouts and Stimulus & Fatigue answers for it. Daily nutrition logs belong to the client and are kept. Meeting program choices cascade, so those meetings fall back to the current program. The enrollment's current-program pointer is cleared. Deleting again succeeds and removes nothing.
- **UI:** coaches who aren't admins see Restore only. Delete opens a confirmation that counts logged workouts and asks for the program's title to be typed, as service deletion does.
- **Verification:** `033_archived_program_actions.test.sql` has 19 pgTAP assertions and passes. `pnpm verify` passes with 319 unit tests. No browser checks.
