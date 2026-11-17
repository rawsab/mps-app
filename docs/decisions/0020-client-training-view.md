# 0020 — Client Training view (read-only)

Date: 2026-11-16 · Status: accepted

- **Two invoker RPCs, one document shape.** `list_published_programs()` and `get_published_program(id)` (migration 00014) read the program's current revision pointer and reuse `private.revision_document`, so the client gets the same `ProgramDraft` JSON the editors use. Both are security invoker, so existing RLS decides visibility. Neither ever reads a draft, even for staff, which makes `get_published_program` reusable for the coach's client preview (FR-05). `get_program_draft` stays staff-only.
- **Archived programs.** They are hidden from the list but stay readable by direct link, with an "Archived" notice, because archiving preserves history (FR-04).
- **Presentation lives in the domain.** `src/domain/programs/clientView.ts` is DOM-free. Ranges print with an en dash ("RIR 1–2"), and a null target prints nothing, never 0. A weight with no unit prints as the bare number. Identical per-set targets collapse to one line; differing ones (e.g. a drop-set last set) are listed per set. Consecutive exercises sharing a `groupId` render as a superset.
- **Sections.** Shared preparation/main sections appear before each day and shared cool-downs after it, collapsed. When a week has Use sections off, the day reads as one untitled list, matching the editor.
- **Open question:** programs under an *ended* enrollment that were not archived still appear in the list. Matt to confirm whether ending a service should hide them.
