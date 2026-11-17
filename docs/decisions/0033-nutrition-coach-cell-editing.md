# 0033 — Coach nutrition editing and client-visible cell attribution

Date: 2026-11-17 · Status: implemented, manual UI verification pending

- Fixed a permission mismatch: the coach program page selected a working draft, while both the view and write function limited daily-entry editing to the published revision. Assigned coaches and admins can now edit real daily entries from either the working sheet or the published Client spreadsheet, including a new program's working sheet before publication.
- Program details still autosave privately and require Publish. Daily actuals are separate, shared client/date records: coach corrections save immediately and appear in any published client sheet covering those dates. Clients still cannot read a draft or write through a private revision. Archived programs, future actuals, computed fields, stale entry versions and unrelated program revisions remain protected.
- Coach-edited input cells have a subtle themed gold tint and a small corner marker. Hover/focus exposes **Edited by coach** via the cell tooltip and accessible name. A compact legend explains the marker. The same component renders coach and client sheets, so attribution is visible to both.
- Intake and output now carry independent server-maintained field attribution. An unchanged companion field keeps its original actor; a later client edit clears only that field's coach marker. Coach clears remain attributed. Notes-only changes do not mark untouched numeric fields. Weight uses its existing per-record attribution.
- Migration `20261117000028_nutrition_coach_edits.sql` backfills calorie field attribution from retained before/after history, adds an attribution trigger, and adjusts working-sheet read/write authorization. Existing RLS, read-only grants, row-version checks, retry handling, notification behavior and actual values are preserved. Notification correction badges also respect surviving per-field coach attribution.
- Verification: typecheck, 275 unit tests, build, 149 targeted database assertions (29 coach editing/attribution + 120 lifecycle/notification/clearing), and 6 nutrition HTTP checks. No browser automation/screenshots. Existing bundle-size warning remains. No skipped approval-pending commands.

Manual checks:

1. On the main coach nutrition program page, select today's or a past Weight/Intake/Output cell and type, or double-click to edit. Confirm it saves even while program details are a working draft.
2. Open the client's published program covering that day and refresh. Confirm the corrected value, gold cell tint and **Edited by coach** hover text.
3. Change only calorie intake as coach: output should not acquire a coach marker. Change output as the client: intake should retain its coach marker until the client changes intake itself.
4. Confirm program detail changes still need publishing, while actual-entry corrections do not. Check both themes and the existing selection/Undo/Paste interactions.
