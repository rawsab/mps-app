# 0062 — Download a program as a backup

Date: 2026-11-24 · Status: accepted (owner request, 2026-11-24 meeting) · Built

- **Change.** Coaches can download any mesocycle or personal training program, live or archived, in two formats:
  - **Spreadsheet (.xlsx)**, to read or keep. A Program sheet (Title or Program Style, Program Theme, coach notes, resources); Every workout when there are shared sections; then one sheet per week, named as in the editor. Each week uses the editor's Spreadsheet columns for that service, plus Alternatives and Demo link. Each row repeats its day and section, so sorting and filtering still work. An empty day gets a row of its own.
  - **Program file (.json)**: the `ProgramDraft` document as the app stores it, which keeps every field (annotations and per-set targets included).
- **Where.** A **⋯** menu beside Duplicate in the editor (downloads what's on screen, unsaved edits included), and the program's **⋯** menu on the client's page (downloads the latest saved draft, or else the published revision).
- **Writer.** `writeXlsx` (`src/lib/xlsx.ts`) writes a minimal workbook with `fflate`, already a dependency, so no new package. Every cell is an inline string, so nothing turns into a number, date or formula: "1-2" stays a range, and text starting with "=" stays text. The header row is bold and frozen. Sheet names follow Excel's rules (`sheetNames`). Tests read the file back through the importer's own `readWorkbook`.
- **Not built.** Restoring from a program file. The JSON is the right input for that later (it would go through `ProgramDraft.parse` and `save_draft`). Nutritional programs have no download yet.
- **Manual checks.**
  - In the editor, open ⋯ › Download spreadsheet. The file is named "Client - Program.xlsx" and opens in Excel or Google Sheets, with Program, then a sheet per week. Check RIR "1-2" isn't a date.
  - Download program file: a readable JSON file.
  - On the client's page, the program's ⋯ menu has both downloads, for live and archived training programs, and not for nutrition.
  - A PT program with a renamed week: that sheet uses the week's name.
