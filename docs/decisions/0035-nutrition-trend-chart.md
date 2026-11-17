# 0035 — Nutrition trend chart

Date: 2026-11-17 · Status: implemented, manual UI verification pending

- FR-09/10: Added a line graph directly below mesocycle weight statistics on coach/client nutrition spreadsheets, and the client Progress summary. Defaults to Weight and Last 7 Days; offers Last 30 Days, Calories consumed, Caloric output and Daily caloric balance.
- Uses existing theme tokens, gold point markers, gold-to-transparent area fill, visible axes and month/day date ticks. The two-line cursor tooltip shares the coach overview chart's border, surface, radius, padding and shadow, with value above date. Points also expose values through keyboard focus. Date tick density adapts to the available width.
- Ranges are inclusive calendar days ending on the client's today, using records covered by the selected program. Calorie series use activity dates and weight series use weigh-in dates. Weights respect the program's lb/kg setting. Missing values are omitted, actual zero is retained, and calorie balances may be negative. Fewer than two points displays the requested muted empty message.
- No new dependencies, database changes or permissions. The graph updates from the same query data as the spreadsheet after acknowledged edits.
- Verification: typecheck, 281 unit tests and production build passed. Existing bundle-size warning remains. No browser automation or screenshots.

Manual checks:

1. On coach and client nutrition pages, switch each metric and both date ranges; check date labels, axes, points and theme-matched gradient.
2. Hover across the plot or focus a point to inspect value/date. Check tooltip placement at the edges and the phone layout in both themes.
3. Confirm fewer than two data points shows “Trends will be available when there is sufficient data.” and that lb/kg switches update weight values.
