# 0005 — Draft save and publish functions

Date: 2026-11-16 · Status: accepted

## Decision

- **Whole-document saves.** `save_draft(program, expected_version, draft)` takes the full `ProgramDraft` and replaces the draft's content in one transaction. Grid's multi-cell changes are atomic by construction, and there is one persistence path for both views (FR-06). Per-command deltas can come later if drafts become large. The contract stays the same either way.
- **Optimistic locking.** `expected_version = null` creates the draft and is refused if one already exists. Otherwise it must equal `lock_version`. A stale save fails with `PT409` (HTTP 409), carries `{"currentVersion": n}` and changes nothing, so the editor keeps its edits for review. The program row is locked `for update` first, so concurrent saves and publishes serialize.
- **The database validates the contract.** SQL readers mirror `contract.ts`: required keys, JSON types (a string such as `"1-2"` never passes for a number or range), enums, uuids, ISO dates, `min <= max`, the per-set-target rule, and ascending week indexes. Failures are `22023` and name the document path. Table constraints cover the remaining length, range and load-mode rules.
- **Node ids are scoped to a revision.** Content tables use `primary key (id, revision_id)`, and position uniques include `revision_id`. `get_program_draft` returns the working draft, or the published revision when there is no draft. Saving that document with `expected_version = null` starts a new draft with the same node ids. Ids therefore stay stable across saves and revisions for the draft command model, and the UI never has to regenerate them. `prescribed_sets` keeps a global id (sets have no id in the contract; M4 snapshots reference the published rows).
- **Publish** (`publish_revision(program, expected_version)`) requires admin, or an assigned coach with `coach_clients.can_publish` (PRD §4). Editing requires only staff access to the client. Publish checks the version and readiness (`PT422`, HTTP 422, whose detail is the same `[{path, message}]` list `validateForPublish` produces), then freezes the revision and moves `current_revision_id` in one transaction. Archived programs and ended enrollments are refused (`55000`).
- `create_program(enrollment)` is the only way to create a program row. It refuses nutrition enrollments and ended enrollments.

## Consequences

- Migration 000002 was edited in place (content primary keys and position uniques) instead of being altered by a later migration. No hosted database exists yet, so a reset covers it. After the first hosted deploy, schema changes must be new migrations.
- Draft saves rewrite `prescribed_sets` rows, so set ids are only stable once published.
- Template, duplicate and import sources still create drafts as `scratch`. Their functions set `source_kind` when they land.
- Update entries and audit events for publish join the same transaction in step 6 (`audit_events`).
- Loads are never negative (external, assisted, and added bodyweight load), in both `Load` and `prescribed_sets_load`. Assistance is its own mode with a positive amount.
