# 0046 — Activity trends beside the feed

Date: 2026-11-20 · Status: implemented (owner request), manual UI verification pending

- **Scope addition, recorded rather than resolved silently.** PRD §6 Reviews describes the feed only. The owner asked for half of the Activity page to show trends.
- **Layout:** on large screens the Activity page (route `/coach/reviews`, now a wide route) is split in half: the feed on the left, trends on the right, sticky while the feed scrolls. Below `lg` the trends follow the feed.
- **Data (`get_staff_activity_stats`, migration 00045):** counts the same items the feed lists (`private.all_staff_activity`, so the same visibility), whatever their read state and the feed's filter. It takes a range (up to 400 days), an `hour` or `day` bucket and the viewer's IANA time zone, and returns the total plus counts per bucket, per kind and per client. Staff only; read only.
- **Windows:** Day (today, per hour), Week (default: the last 7 days, per day) and Month (the last 30 days, per day), all ending with today in the viewer's time zone. The choice lives in `?range=`, alongside `?filter=`.
- **Charts:** one series each, in a single chart color (`--color-chart-bar`, 3:1 against the surface in both themes, checked with the dataviz validator), so there's no legend.
  - Notifications received: the total, then columns per hour or day. Hover shows the slot and count just above the cursor; a hidden table repeats the numbers for screen readers.
  - By type and By client: horizontal bars, busiest first, each labelled with its count and share. Clients beyond the top five fold into "N other clients"; client names link to their page.
- **Verification:** `034_staff_activity_stats.test.sql` (12 pgTAP assertions) passes, including that every breakdown adds up to the feed's own count. `pnpm verify` passes with 326 unit tests. No browser checks.
