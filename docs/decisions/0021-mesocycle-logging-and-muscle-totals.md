# 0021 — Mesocycle set logging, muscle totals and the Stimulus & Fatigue plan

Date: 2026-11-17 · Status: logging and totals accepted; Stimulus & Fatigue planned (not built)

## Muscle groups on exercises (FR-05, FR-06)

- `Exercise.muscles` is a list of up to 8 names (migration 00015, `program_exercises.muscles`). It is optional in the contract, so older documents load and save as `[]`. The draft patch extends it without the document default, so a patch that leaves it out never clears it.
- Owner decision: an exercise may list **several muscles, and each logged set counts once for every muscle listed** (e.g. Leg press → Quads, Glutes). There are no fractional weights. This differs from the sample sheet's hand-entered fractional totals (Back 9.5), which PRD §10 says need Matt-reviewed weights. Those stay legacy values.
- Names are free text, matched case-insensitively. Both editors autocomplete from muscles already used **in the same week** (shared sections: the whole program). Committing takes the week's existing spelling, so typing "glutes" joins "Glutes". Mesocycle grids show **Muscles** after RIR goal; personal-training grids don't show it.

## Sessions and logged sets (FR-04, FR-07, NFR-03)

- `training_sessions` holds one log per program day (`unique (program_id, day_id)`). It is pinned to the published revision that was current when it started. That revision is immutable, so it is the session's target snapshot; a later publish never moves it (invariant 6). `logged_sets` holds actual load (mode/value/unit) and reps per set. These are results and never become targets.
- Browsers get SELECT only. `start_session`, `save_logged_set`, `delete_logged_set` and `update_session` are security definer and check `can_log_for_client`: the client themself **or staff with access**. Coaches can therefore correct any client log, and `updated_by` attributes the change (shown as "Edited by your coach"). Full audit history arrives with `audit_events`.
- Rules:
  - Set ids come from the browser, so a retried save updates the same row (no duplicates).
  - Sets are numbered 1…the exercise's **maximum** prescribed set count, and only the last set can be removed.
  - Only exercises of the session's own day are accepted.
  - A weight always has an explicit lb/kg chosen by the person; BW is its own mode.
  - Null reps mean "not entered"; 0 is a result.
- Logging is mesocycle-only for now; personal training stays read-only.
- Unit default in the UI: the previous set's unit, else the prescription's unit, else the client's most recently used unit, else none (they must pick). The PRD §15 default-unit decision remains open.
- A bug caught by the tests: `current_client_id()` is null for staff, so `x = current_client_id() or …` evaluated to null and `if not …` let an unassigned coach through. The helper now coalesces to false. Future helpers must never return null.

## Set totals and change (FR-10)

- Per day: logged sets (rows with reps) out of planned sets (the sum of each exercise's maximum set count), per muscle and in total.
- Owner decision: **Change compares with the last earlier day (in program order, across weeks) that trained the muscle**, using logged sets on both days. It is null ("—") when this day isn't logged, the muscle wasn't trained earlier, or that earlier day has no log. Missing data is never treated as zero.
- A logged day uses its session's snapshot for both planned totals and muscles.

## Stimulus & Fatigue Tracking — plan (FR-08), not yet built

Source: the sample's day blocks and its "Additional Resources" sheet.

1. **What is asked, per muscle trained that day** (the day's exercise muscles):
   - *Acute Muscle Stimulus*: challenge, pump, disruption, each 0–3. Asked for every muscle trained that day.
   - *Set Progression Assessment*: soreness ("how sore did you get") and performance ("how was your performance"), each 0–3. Asked only for muscles that were also trained on an earlier day. The sample shows it on Days 4–6, after Days 1–3 trained the same muscles.
2. **Data:** a `muscle_feedback` table keyed by `(session_id, muscle_key)`. It stores the display name, the five nullable 0–3 scores, `compared_session_id` (the earlier session the progression answers refer to, found by the same rule as Change), and `updated_by`. RLS, grants and pgTAP ship in the same migration. Writes go through one security-definer function shared by client and staff, like sets.
3. **Rules:**
   - Every question is optional and unanswered stays null.
   - Feedback never blocks completing a workout.
   - The stimulus total (0–9) only shows when all three answers exist; otherwise it shows "incomplete".
   - The sheet's "Total:" formulas are not reproduced.
4. **Guidance:** scale descriptions appear beside each question at the point of entry. The coach view shows the sheet's grading as a suggestion only:
   - Stimulus 0–3 → add 2–4 sets; 4–6 → progress normally; 7–9 → drop volume.
   - Soreness × performance matrix → "Add 1–3 sets" … "Recovery".
   - It never changes a prescription (PRD FR-08).
5. **UI:** an optional "Stimulus & Fatigue" card under the day's set totals. It has one compact 0–3 segmented control per question per muscle, saves on change, and has the same coach-edit attribution. The coach gets a per-week muscle table.
6. **Open questions for Matt:**
   - Confirm the scale wording and the soreness × performance matrix. The sample's matrix is partly blank.
   - Is "performance" per muscle (as in the sample) or per exercise?
   - Should Set Progression also be asked on Week 2+ Day 1, where the comparison crosses weeks?
   - The rubric text is MPS IP. Keep it in the (private) codebase, or store it as editable template content?
