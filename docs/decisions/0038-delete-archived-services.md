# 0038 — Deleting archived services

Date: 2026-11-17 · Status: accepted (owner request)

- On the coach's client page, the Services card has "Show archived services (N)". Each archived service has a delete button with a confirmation. Like every service change, this is admin only (decision 0017).
- Only an ended, archived service can be deleted, through `delete_archived_service` (migration 00032). Browsers still have no DELETE grant.
- **History is never deleted with it.** Programs and nutrition programs already block deletion (`on delete restrict`). PT patterns would cascade into session history, so they block it too. The refusal names what is still linked, e.g. "This service still has 1 program linked: delete them first, or keep the service archived."
- Verification: 9 pgTAP assertions (`025_delete_archived_services.test.sql`).
