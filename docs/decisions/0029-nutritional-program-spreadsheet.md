# 0029 — Nutritional programs and weekly spreadsheets

Date: 2026-11-17 · Status: implemented, manual UI verification pending

Decision 0030 adds a daily entry form above the client spreadsheet and connects saved nutrition records to coach notifications.

Decision 0033 allows coaches to edit shared daily actuals directly from a working sheet; program details remain private until published.

## Owner-approved behavior (FR-04/09/10)

- Each nutrition enrollment supports multiple named programs. Program Style is the title. The Programs list renders nutrition using the same rows, lifecycle badges, filters and removal menu as training. Creation labels are **New Mesocycle Program**, **New Nutritional Program** and **New Personal Training Program**.
- Nutritional programs have separate draft and immutable published revisions, preserving their dedicated nutrition data model. Clients never read drafts. Publish/archive requires the same explicit publishing capability as training. Unpublished programs may be deleted; published programs are archived and remain readable. Staff can open the published Client spreadsheet separately from the working draft.
- Start Date replaces Date Assigned/Date Received; no second date field is introduced. Four weeks is the default. Weeks are consecutive seven-day periods from Start Date, independent of the calendar weekday; length can be set from 1 to 52 weeks.
- Coach baseline fields are Program Style, Start Date, length, Starting Predicted Maintenance Calories, Starting Predicted Daily Caloric Goal, and optional notes. Starting Predicted Weight Change Per Week is calculated as `(goal - maintenance) * 7 / 3500` lbs. Baseline changes require saving a draft and publishing; existing published revisions remain immutable.
- Both coach and client have a Spreadsheet view, with no List View. Each week has seven dated rows: Weight (lbs), Calories Consumed Day Before, Caloric Output Day Before, Daily Caloric Balance and Average Weight. Date is fixed by program structure. Client actuals save on cell blur; Enter/Up/Down move between rows. Rectangular numeric paste is bounded to the editable columns and the current week, validated and saved atomically. Failed text remains visible; retries use stable request IDs. Program details autosave after editing, with publishing remaining an explicit action (decision 0032).
- A displayed row date is the weigh-in date. Its calorie fields persist against the preceding activity date. Weight stays separate from calorie activity. Missing values are null, never zero. Calories may be an actual zero. Original weight units remain in storage and convert explicitly to pounds in this sheet.
- Daily records remain shared by client/date, rather than copied into each program. Overlapping programs therefore show the same actuals. Overlaps with other unarchived programs produce a warning, never an error; clients see only published overlaps. Coach readers can also warn about drafts. Publishing a new revision does not rewrite daily logs. Saving from a superseded revision is refused until the current sheet is loaded.
- Coach corrections keep the existing before/after audit history and staff attribution. Paused/ended client services are read-only, disabled accounts are denied, archived sheets are read-only. Access checks and row-level policies remain server-enforced. Unsaved details/entries trigger navigation and tab-close warnings.

## Calculations confirmed with the owner

- Daily Caloric Balance = consumption **minus** output, both for the preceding activity date. A missing member of the pair yields no balance.
- Average Weight is a rolling average over the last seven calendar dates, requiring at least three actual weigh-ins. Future rows show no computed averages. Weekly average weight uses only the program week's dates up to today, also requiring three weigh-ins.
- Weekly Caloric Values: average available complete daily balances; average available output entries; sum of complete daily balances. Coverage is displayed, and incomplete calorie weeks are labelled partial. No missing day is projected or replaced with zero.
- Predicted Weight Change = available Weekly Caloric Balance / 3500, explicitly labelled an estimate.
- Average Weight Change = **this week's average weight minus the preceding week's average weight**, requiring at least three weigh-ins in both weeks. Week 1 compares its qualifying average against the first recorded weigh-in within that program week. This replaces both the owner's initial endpoint-difference request and the sample's inconsistent week-one formula.
- At a glance: sum available weekly predicted changes; sum available weekly average-weight changes; divide that actual sum by the number of weeks with sufficient data to compute a change. Unknown totals remain unavailable, while an actual zero stays zero. Coverage counts accompany the summaries.
- The sample's 28 daily calorie rows independently reconcile to weekly balances of 3689, 3113, 2990 and 4036 kcal and predicted total 3.950857143 lbs. With the approved weekly-average definition, its actual total is 4.571428571 lbs and average change per qualifying week is 1.142857143 lbs. Formula calculations retain precision; presentation rounds weight changes to two decimals, average weight to one, and average kcal values to one.

## Implementation and verification

- Migration `20261117000025_nutrition_programs.sql` adds nutrition program/revision tables, grants, policies, immutable-revision trigger and checked lifecycle/sheet RPCs. Already-assigned legacy targets are copied into published program baselines; existing actuals and audit records are neither moved nor duplicated. Legacy tables remain intact.
- The frontend reuses existing app tokens, typography, row/card styling, buttons, fields, dialogs and notices. The relevant taste-skill rules are consistency, aligned edges, restrained colour, accessible controls, honest save feedback and responsive layouts. Weekly summary tables share one connected frame beside the main sheet on wide screens and stack below it on smaller screens. Marketing heroes, imagery, effects and palette changes do not apply.
- Verification: typecheck, 267 unit tests and production build pass. Targeted nutrition database suites pass 106 assertions (45 existing + 61 lifecycle/spreadsheet). Five HTTP checks cover response schemas, permissions, draft creation/save/reload/deletion and the nested Programs-list relation. The existing bundle-size warning remains. No browser automation or screenshot analysis, respecting the owner's standing preference.

## Manual checks

1. On a nutrition client's Programs list, create two nutritional programs. Confirm the same row styling as training and the requested creation labels.
2. Set Program Style, Start Date and calorie baselines; save the draft. Confirm four weekly tables by default and the calculated starting prediction.
3. Publish, sign in as that client, and open Nutrition → program. Enter weight and previous-day calories; reload and confirm the date mapping and saved values.
4. Log at least three weights in each of two weeks. Check rolling averages, Week 1 versus its first weigh-in, Week 2 versus Week 1's average, and the at-a-glance totals.
5. Paste a small numeric rectangle; check a rejected paste cannot partially save. Open the same record in two tabs and check stale edits fail visibly.
6. Publish an overlapping program and confirm the warning permits it and shared dates show the same actuals. Correct a value as coach and inspect correction history.
7. Archive a program and confirm history remains readable. Check both themes and phone width; the main spreadsheet scrolls inside its frame and the weekly summaries stack below it.
