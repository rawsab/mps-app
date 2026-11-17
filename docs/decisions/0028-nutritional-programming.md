# 0028 — Nutritional Programming

Date: 2026-11-17 · Status: implemented, manual UI verification pending

The standalone target-assignment UI and calendar-week summaries below are superseded by the program lifecycle and program-relative spreadsheet in decision 0029. Daily records and their correction history remain the source of actuals.

- FR-09/FR-10, M5: nutrition uses dedicated immutable effective-dated targets, bodyweight records and calorie activity records. It does not use the workout editor. Coach entry point: client Programs → Nutritional Programming. Clients use Nutrition, Home and Progress.
- Assigning a target is an explicit client-visible action. Assigned coaches can change prescribed targets under the PRD access matrix. The first target may start in the past; subsequent targets must start today or later and after the latest target's start. Use tomorrow to preserve today's goal. Targets cannot be overwritten. A later target supersedes the previous one; an ended target does not revive an older version. Target history displays the resulting effective periods.
- Targets include style, daily calorie goal, optional estimated maintenance, start/end dates, optional baseline weight with explicit units, and client instructions. Estimated maintenance is not substituted for actual estimated-output entries.
- Weigh-in date and calorie activity date are independent. Defaults are today's weight and yesterday's calories in the client's configured timezone, supplied by the database. One row per client/date/type. Values are explicit lb/kg and whole kcal; null is unknown, zero calories is valid.
- Clients with an active, currently effective nutrition enrollment can log. Paused/ended enrollments retain read access; disabled clients lose access immediately. Assigned staff can correct saved entries. RLS and RPC authorization enforce these rules. No direct table writes are granted.
- Both daily saves and target assignment use request UUIDs for lost-response retries. Daily edits require an expected version; stale writes fail visibly. Reload saved entry explicitly replaces the form with current server values. Unsaved values remain in the form after a failed request. Before/after correction history retains actor, time and coach/client attribution.
- History loads 28 calendar dates with navigation to older periods. Latest 100 saves for that period are available in coach correction history. This dedicated history is separate from the existing training Reviews feed; nutrition notifications are a later extension.
- Rolling weight uses the last seven calendar dates; weekly periods start Monday. Three measurements are required to show an average; comparison requires three in each week. Explicit kg/lb conversion precedes averaging. All summaries show coverage. Balance is intake minus estimated output; weekly sums include only complete pairs and partial weeks are labelled.
- Imports, calorie-to-weight predictions, and a general cross-feature audit feed remain later work. No unapproved prediction formula is exposed.
- Migration `20261117000024_nutritional_programming.sql` is applied locally without resetting existing records. Verification: typecheck, 258 unit tests, production build, 45 transactional database assertions, and 4 read-only HTTP tests. Existing bundle-size warning remains. No browser automation or screenshots, following the owner's preference.

Manual checks:

1. As coach, open a nutrition client's Programs, assign a target, and confirm its date and instructions as the client.
2. Save today's weight and yesterday's calories, reload, and confirm dates/values and Home task state.
3. Change dates to correct an entry; correct it as coach and inspect before/after history.
4. Assign a later goal and check earlier calorie history retains the earlier goal.
5. Check Nutrition and Progress at phone width and in both themes; fewer than three weigh-ins must show unavailable weight averages.
