# 0017 — Ended service archiving

Date: 2026-11-16 · Status: requested by the owner

## Decision (FR-04, NFR-01)

- Service names, status pills and actions share one row. Live services use a right-aligned three-dot menu with text-only Pause/Resume and End options. Ended services instead have an archive-box button immediately after their Ended pill.
- Archiving hides an ended enrollment from the client's Services card and persists across reloads. It preserves the enrollment and linked programs/history. Live-service counts and available-service calculations keep their existing semantics.
- Migration 00011 adds `service_enrollments.archived_at`, permits archive state only while ended, and extends column update grants. Existing admin-only enrollment management RLS remains authoritative; assigned coaches and clients cannot change archive state. The UI follows existing admin edit permissions.

## Verification

- Typecheck and eight targeted database assertions passed, covering archive persistence, linked program retention, ended-only state, coach/client refusal and reversibility. Migration applied locally; no database reset or browser checks.
- Manual check: open the text-only service menu, Pause/Resume/End, archive an ended service, and reload to confirm it stays hidden.
