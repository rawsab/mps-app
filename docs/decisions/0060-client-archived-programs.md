# 0060 — Clients see their archived programs

Date: 2026-11-24 · Status: accepted (owner request, 2026-11-24 meeting) · Built

- **Change.** Clients can list their archived mesocycle and personal training programs. Before this, an archived program was readable as history (`get_published_program` returns `archivedAt`, and the program page shows an "Archived program" notice), but nothing linked to it.
- **Server.** A new `list_archived_programs()` (migration 00056) returns the caller's archived programs that were published at least once, newest archive first, in `list_published_programs`'s shape plus `archivedAt`. It runs as the caller, so the existing `programs` and `program_revisions` policies decide what is listed. Drafts never appear. pgTAP: `042_client_archived_programs.test.sql`.
- **Why a separate function.** `list_published_programs` feeds Home, the Services page and the PT dashboard, which should keep showing live programs only. A second list leaves them unchanged.
- **UI.** An **Archived programs · N** disclosure, closed by default, below the list on the Mesocycle page and under Your program on the PT dashboard (`ArchivedPrograms` in `TrainingPages.tsx`). Rows are the usual program rows, saying "archived {date}" instead of "updated {date}". It's hidden when there are none and shows an error if the list fails to load.
- **Not changed.** Home and the Services page don't list archived programs. Archived programs are read only, and logging stays closed (decision 0045).
- **Manual checks.**
  - As a client with an archived mesocycle program: the Mesocycle page shows Archived programs · 1. Opening it lists the program with its archive date, and the program opens with the Archived notice.
  - As a client with an archived PT program: the same, under Your program on the Personal training page.
  - As a client with no archived programs: no Archived programs line.
  - Restore the program as a coach: it leaves the archived list and returns to the main list.
