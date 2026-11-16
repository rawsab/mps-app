# M1 import feasibility spike — report

Date: 2026-11-16 · Parser `mps-ooxml@0.1.0-spike` · Reproduce: `pnpm spike:import` (writes full JSON to `reports/`, gitignored)

## Result

The approach handles all three supplied template families. Within each supported family, every non-empty source item ends up mapped, excluded with a reason, or unresolved with an issue. No sample produced an empty "successful" import. No sample is commit-ready, which is correct: each contains genuine ambiguities that need Matt's decision.

| Sample | Size | Parse time | Items | Mapped | Excluded | Unresolved | Structure found |
|---|---|---|---|---|---|---|---|
| Mesocycle Sample (Google Drive).xlsx | 114 KiB | ~65 ms | 969 | 593 | 233 | 143 | 1 week, 6 days, 47 exercises, 6 undated sessions with feedback, 1 resource sheet |
| Nutrition Template Sample (Google Drive).xlsx | 78 KiB | ~15 ms | 270 | 147 | 118 | 5 | 28 weigh-ins, 28 intake/output logs, 1 proposed target |
| Personal Training Document Sample.docx | 155 KiB | ~20 ms | 140 | 130 | 2 | 8 | 2 days (18 exercises), 3 preparation/cool-down sections |

Timings are from Node 22 on the development Mac, cold, including SHA-256. They're far inside the NFR-05 target of 10 s for small files. Heap growth was under 10 MiB per file. Worker and mobile timings are still to be measured in M7.

## What the samples showed, and how the profile treats it

### Mesocycle
- **Date-converted RIR:** C15, C20 and C34 store serial `46024` with number format `m-d`, which displays "1-2". The cells are flagged `RIR_DATE_CONVERTED` (blocking) with the proposal "RIR range 1-2". The target RIR stays `null` until Matt confirms it.
- **Logged results, not prescriptions:** the Weight/Reps pairs hold actual performance. They become undated `history.sessions`, and the prescription gets no set count or load (FR-15). The week label "July 20th to 27th" has no year or per-day dates, so `HISTORY_DATE_REQUIRED` proposes importing structure only.
- **Notation:**
  - `BW` becomes the bodyweight mode.
  - `Didn't do` becomes a skipped set.
  - Decimal reps (8.5, 9.5, 10.5) are preserved.
  - `90 ds`, `70 ds`, `150 ds` and `180 ds` are split into a load plus a "drop set" annotation proposal.
  - `70 qs` is an unknown annotation with no proposal.
- **Units:** all 133 logged loads are bare numbers. One blocking `LOAD_UNIT_UNKNOWN` decision covers the file.
- **"X or" rows:** "Silver Leg Press or" / "Smith Machine Squat", "Machine Chest Fly or" / "Cable Chest Fly" and "Seated Calf Raise or" / "Machine Calf Raises". Both rows in each pair have their own RIR and logged sets, so the intended meaning is ambiguous. They're grouped and flagged as blocking.
- **Feedback:** 0–3 muscle scores (challenge, pump, disruption, soreness, performance) become session feedback. The "Total:" formulas are excluded as legacy.
- **Stray value:** AH16 (`0.0`, under no muscle heading) is left unresolved instead of guessed.
- **Coach text:** "New Mesocycle Updates:" (B89/C89) becomes program coach notes. The "Additional Resources" sheet becomes a text resource for review.
- **Legacy formulas that are internally inconsistent** (all kept as excluded evidence and not reproduced; for Matt's §15.3/§15.4 review):
  - `Forearms` E106 `=SUM(Q82,Q43)` sums the two **Triceps** cells, identical to E101 Triceps.
  - `Back` E99 `=SUM(Q66,Q57,Q27)` includes Q57, which is Day 4 **Mid Delt**.
  - `Minutes per Set` for Day 4 (Q99) divides by Day 3's total (Q45), and Day 6 (Q101) divides by Day 5's (Q71).
  - The per-day "Set Totals" are hand-entered fractional muscle attributions. Under PRD §10 they need Matt-reviewed weights before the app calculates them.

### Nutrition
- **Header names:** these vary between blocks ("Calories Consumed Day Before" vs "Calories Day B4"). Synonyms handle both.
- **"Day before" columns:** these are assigned to the previous calendar date. The 2026-04-14 weigh-in pairs with 2026-04-13 intake.
- **Header date mismatch:** "DATE RECEIVED: July 20, 2026" disagrees with the logged dates (2026-04-14 → 2026-05-11). It's flagged, and the received date is never used as an activity date.
- **Starting targets:** maintenance 2600 and goal 2800 become a proposed target. With no effective date, this is blocking, with a proposal of the first logged date.
- **Unit:** lb is proposed from the label "Weekly Weight Values (lbs)" as a warning to confirm, not assumed.
- **Legacy calculation notes:**
  - "Average Weight" G25–G30 uses an 8-row window (`AVERAGE(E18:F25)`), unlike the 7-row week-end averages.
  - Week 1's "Average Weight Change" is `E23-E17` (first and last weigh-in) while later weeks use `G31-G23` (difference of averages). This is the inconsistency PRD §3 mentions.
  - The predicted change uses the 3,500 kcal/lb heuristic, which awaits Matt's confirmation.
  - The week-end averages match the app's mean for each week, so no discrepancy issue was raised.

### Personal training (Word)
- **Section types:**
  - Two-column circuit tables ("Warm-Up", "Hip Mobility") become shared preparation sections.
  - Five-column tables ("Day 1 Full Body", "Foam Rolling Circuit") become days or shared sections.
  - "Note:" paragraphs attach to the preceding section.
  - The empty "Note:" is excluded with a reason.
- **Notation:**
  - `30 seconds x2` becomes 30 s × 2 sets.
  - `Sets: 1-2 Reps: 15 each leg Weight: Blue` becomes a set range, per-side reps and the band label "Blue".
  - `60 secs each side` becomes a per-side duration.
  - `8.5-9` RPE becomes a range.
  - `--` means not applicable.
  - `40lbs` gets an explicit lb unit.
- **Flagged for review:**
  - `20, 18`, `14, 12`, `17, 16` and `12, 10`: per-set targets or recorded results?
  - `Reverse Nordic` with 0 sets but reps `12, 10`.
  - `35lbs (1)` and `20lbs (1)`: meaning of "(1)".
  - "…Front Squat or": continuation onto the next row.
  - Inline "A, B or C" stretch names.
- **Header metadata:** "Name: Sample" / "Date: November 7, 2026" in the header is metadata only.

## Variations covered by synthetic tests

`tests/imports/*.test.ts` builds files in memory (no real client data) for:
- an inserted "Tempo" column (flagged blocking, with a "map to notes" proposal)
- blank rows after the header
- a block moved to another column and row
- two day blocks
- the 1904 date system
- string, numeric and date-converted RIR
- unknown stray cells
- determinism
- nutrition synonyms, blank rows and missing values
- Word circuit and day tables

Preflight tests cover:
- wrong extension, non-ZIP content and a truncated ZIP
- CFB (password-protected) files
- a non-workbook archive
- size and expansion limits (a compressed bomb)
- sheet and cell limits
- DOCTYPE/entity expansion
- an unsupported layout
- macro presence

## Gaps before M7

1. **No altered real-world corpus yet.** Each family has one sample. The PRD (§15.2) asks for at least one altered-layout real file per family: moved or merged headings, reordered days, multi-week workbooks, and a Google-Docs export variant.
2. **Merged cells** are recorded but not yet used for heading spans. Repeated header rows inside one block, and multiple weeks across several sheets, are handled in code but untested on real files.
3. **Week-to-sheet mapping** for multi-week mesocycle workbooks needs a real example.
4. **The Review/Resolve UI, worker wrapper with cancel/timeout, private upload, checksum duplicate detection and transactional commit** are M7 work.
5. Golden JSON outputs are not committed. The sample assertions in `tests/imports/samples.test.ts` were written from the raw cell dump and should be reviewed by Matt alongside the issue list.
