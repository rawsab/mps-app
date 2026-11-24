# 0061 — Duplicate a program, optionally replacing it

Date: 2026-11-24 · Status: accepted (owner request, 2026-11-24 meeting) · Built

- **Why.** Matt's personal training routine: go through a program with the client, adding notes. Then duplicate it, archive the old one, make the copy current, change the copy, and repeat. The owner said duplicating was the most important part of the request.
- **Where.** **Duplicate** in the editor toolbar, beside Publish, and **Duplicate…** in a program's **⋯** menu on the client's page (live programs, and archived ones whose service is still live). Mesocycle programs get it too: the code is the same and it's useful there. Nutritional programs don't.
- **Dialog.** For a published, live program it offers **Archive this one, use the copy** (primary) or **Keep both**. For a draft-only or archived program it offers **Duplicate** alone. Then the copy's editor opens.
- **Copy.** `copyProgramDraft` (`src/domain/programs/commands.ts`) copies the latest saved content (the draft if there is one, else the published revision), with fresh ids, as Duplicate week does. Title, Program Theme, coach notes, week names, Focus, sections, exercises, prescriptions, notes, supersets (under new group ids) and resources are kept. Exercises keep `logicalKey`, so history can follow the same movement. Week start dates and day dates are cleared. In the editor, Duplicate waits until edits have saved.
- **Server.** `duplicate_program(program, draft, replace)` (migration 00057) creates the program in the same service (`create_program`, which refuses an ended service) and saves the draft through `save_draft`, which validates it as for any save. With `replace`, the source must be published and not archived, and the caller needs publish rights (as for archiving). The source is archived and the copy becomes the service's current program, all in one transaction. pgTAP: `043_duplicate_program.test.sql`.
- **The copy is a draft.** The client sees it once it's published. With replace, the client has no current program to open until then. The archived original stays readable under Archived programs (decision 0060). Help tells coaches to publish before the session. A later option is to archive the original only when the copy is first published; this needs a stored link from copy to original.
- **Not built yet** (from the same request; needs the owner's answer). "Separate notes for each day": today a day has Focus, section instructions and per-exercise notes, but no day notes field. Adding one is a contract and schema change across save, publish and the published document.
- **Manual checks.**
  - PT program, published: Duplicate in the editor, choose Archive this one, use the copy. The copy opens as a draft with the same content. On the client's page the old one is Archived and the copy is Current.
  - Keep both: both programs are listed; the original's Current badge is unchanged.
  - Draft-only program: the dialog shows Duplicate only.
  - Make an edit and press Duplicate straight away: it's disabled until the change saves.
  - Publish the copy and sign in as the client: it shows as the current program, and the old one is under Archived programs.
  - From the ⋯ menu on an archived program: Duplicate… makes a live draft copy.
