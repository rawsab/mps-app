# 0004 — Program storage, immutability and write path

Date: 2026-11-16 · Status: accepted

## Decision

- **Client programs are relational; templates are documents.** Revisions store the week → day → section → exercise → prescribed-set hierarchy in tables, as roadmap §6 proposes. Sessions (M4) can then reference a prescribed set by id, and RLS and constraints apply per row. Template versions store a validated `ProgramDraft` as `jsonb`. They hold no client data, nothing references their inner rows, and assigning one copies the content into a new revision (FR-04: editing a template never rewrites assigned programs).
- **Parent chain by composite FK.** Every content row carries `revision_id`, and each parent link is `(parent_id, revision_id)`. Revisions reference `(program_id, client_id)`. Programs reference `(enrollment_id, client_id, service)`. A mismatched client, revision or service fails as a FK violation (roadmap §6 invariant 1).
- **Immutability is enforced by triggers.** Once a revision or template version is `published`, it can't be updated or deleted, and its content rows can't be inserted, updated or deleted. This holds for every role, including the future security-definer functions. The only allowed transition is draft → published. `programs.current_revision_id` must point to a published revision of the same program.
- **One working draft per program** (partial unique index). `lock_version` on the revision backs `save_draft(expected_version, …)`.
- **Browsers are read-only on these tables.** Staff and clients get `SELECT` only. All writes will go through transactional security-definer functions (`save_draft`, `publish_revision`, template functions), which check authorization, lock version, contract validation and `coach_clients.can_publish`. Even admins can't write directly (tested).
- **Visibility:** staff with access to the client read drafts and published revisions. The client reads published revisions only, and sees a program only once it has a current revision. Program titles live on revisions so a draft rename never reaches the client.
- Ranges are `numeric` min/max pairs with `min <= max` checks. Null means not prescribed. Load-mode combinations are checked (for example, a band has a label and no weight).

## Consequences

- The DB uses uuids for content ids while `ProgramDraft` ids are strings. Editors and the importer must generate uuids (`crypto.randomUUID()`) for new nodes; `save_draft` will reject anything else.
- Set counts are `numeric` to match `NumericRange` in the contract.
- Discarding a draft deletes it with its content (cascade). Published content is never deleted. Archiving sets `programs.archived_at`.
- The import batch source link (`source_kind = 'import'`) gets its FK when `import_batches` lands (migration step 5).
