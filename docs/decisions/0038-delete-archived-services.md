# 0038 — Deleting archived services

Date: 2026-11-17 · Status: accepted (owner request)

- On the coach's client page, the Services card has "Show archived services (N)". Each archived service has a delete button with a confirmation. Like every service change, this is admin only (decision 0017).
- Only an ended, archived service can be deleted, through `delete_archived_service` (migration 00032). Browsers still have no DELETE grant.
- **History is never deleted with it.** Programs and nutrition programs already block deletion (`on delete restrict`). PT patterns would cascade into session history, so they block it too. The refusal names what is still linked, e.g. "This service still has 1 program linked: delete them first, or keep the service archived."
- Verification: 9 pgTAP assertions (`025_delete_archived_services.test.sql`).

**Revised the same day (owner decision): delete with programs.**
- When programs are still linked, the dialog lists them (how many, how many published, how many logged workouts) and offers "Also delete its programs".
- That option deletes the programs, every revision (published included) and their content, and the client's logged workouts and Stimulus & Fatigue answers for them. Daily nutrition logs belong to the client and are kept.
- It needs the service name typed to confirm.
- **The exception to "published revisions are immutable" is narrow** (migration 00034):
  - `delete_archived_service(…, true)` sets a transaction-local flag that the revision guards honour for deletes only.
  - Published content still can't be edited.
  - Browsers have no DELETE grant on these tables.
  - Tests confirm the guard is back in force once the purge ends.
- PT patterns no longer belong to an enrollment (decision 0039), so they don't block deletion.
- Verification: 17 assertions in `025_delete_archived_services.test.sql`.
