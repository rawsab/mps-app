# 0059 — Rename in place, PT week names, and Delete row

Date: 2026-11-24 · Status: accepted (owner request, 2026-11-24 meeting) · Built

- **Delete row.** The Spreadsheet's cell menu (right-click, the Menu key or Shift+F10) has **Delete row**, which removes that exercise. Undo brings it back, so there's no confirmation, unlike Delete day and Delete week. Focus moves to the next row's Exercise cell, or the previous row's when it was the last. A day left with no exercises shows its "No exercises" drop target, as before. This works for both mesocycle and personal training programs.
- **Program title.** A faint pencil beside the title at the top of the editor turns it into an input in place (`EditableText` in `src/components/`). Enter or leaving the field saves through `updateProgram`; Escape cancels. It edits the same field as Program details (Program Style for mesocycles, Title for personal training). The pencil is hidden while the program is archived or publishing.
- **PT week names.** Updates the rule that weeks are always numbered from their position. A personal training week shows its stored `label` when the coach has named it. A blank label, or a default "Week N" one, still shows the order-based number (`customWeekName`, `weekTitle` in `src/domain/programs/labels.ts`). So new weeks, which store "Week N", renumber as before. The pencil sits beside the week heading in the Spreadsheet and in the week's settings in List View. Clearing the name brings the number back. Clients see the name too (`weekSummaries`, Home's next workout).
- **Why mesocycles stay numbered.** Their stored labels are imported sheet headings (sometimes with dates), which the earlier rule deliberately hides. The owner asked for renaming in personal training only.
- **No schema change.** `label` was already saved and published for every week.
- **Not changed.** The Activity feed still names weeks by number: it gets only the week index from SQL.
- **Manual checks.**
  - Spreadsheet (mesocycle and PT): right-click a cell, choose Delete row. The row goes, focus lands on the next row, and Undo restores it.
  - Program editor: the pencil beside the title is faint and brightens on hover. Rename, press Enter; the title and Program details both change. Escape keeps the old title.
  - PT program: rename a week in the Spreadsheet and in List View's week settings. The outline, the Move and Add dialogs, and the client's program show the new name. Clear it and it shows "Week N" again.
  - Mesocycle program: week headings have no pencil.
  - Archived program: no pencils.
