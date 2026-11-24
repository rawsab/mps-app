# 0065 — Publish only with changes; faded icons for archived programs

Date: 2026-11-24 · Status: accepted (owner request) · Built

- **Publish waits for a change.** In the program editor, Publish is disabled when there's nothing new for the client. Its tooltip says why.
  - *Published program:* the editor loads the published document (`get_published_program`) and compares it with the draft on screen (`sameProgram`, `src/domain/programs/compare.ts`, which ignores key order). A draft whose edits were all undone matches and can't be published. Both documents come from the same server reader (`private.revision_document`), so an untouched draft always matches.
  - *Never published:* Publish is available once there's a saved draft or an unsaved edit.
  - If the published document can't be loaded, Publish stays available rather than getting stuck. After publishing, the published document and the program row are refetched.
  - Publish readiness and its issue count are unchanged.
- **Archived icons.** The round service icon of an archived program is drawn at half opacity. This applies on the coach's Programs card, the client's Archived programs list (decision 0060) and the Nutrition program list.
- **Manual checks.**
  - Open a published program: Publish is greyed out. Edit a cell: it turns on. Undo: it greys out again straight away.
  - New program: Publish turns on after the first edit.
  - Publish, then check it greys out straight away.
  - On a client's page with an archived program, and in the client's Archived programs list, the icon is faded.
