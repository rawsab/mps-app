# 0040 — Meetings page

Date: 2026-11-17 · Status: accepted (owner request)

- A **Meetings** sidebar item (`/coach/meetings`) shows every meeting the coach can see, in the coach's own time zone (profile setting).
- **At a glance:**
  - "In 2 days, 3 hours, 15 minutes" under the "Next meeting" heading, leaving out zero parts ("less than a minute" in the last minute), with the client, time and services. It updates every 30 seconds.
  - A meeting in progress shows as "Now · client until 8:00 AM".
  - **Upcoming** lists the next three scheduled meetings.
- **Calendar:**
  - Month, week and day views, with Today and ‹ › navigation. Weeks start on Monday, like patterns. The view and date live in the URL (`?view=week&date=2026-11-17`). Without one, phones open the day view and wider screens the week view.
  - The month view shows three meeting chips per day, then "+N more" (opens that day).
  - The week and day views are a 24-hour grid that opens near the current hour (else 7 AM). It has a red "now" line, and overlapping meetings sit side by side (`layoutDay`).
  - Chips are coloured by the first service: Personal training gold, Nutrition green, Mesocycle neutral. Cancelled meetings are struck through and dimmed. "Hide cancelled" shares its remembered setting with the client page's list.
  - Clicking a meeting opens it on the client's page (`?session=`), so all editing stays in one dialog.
- Calendar maths (`src/domain/scheduling/calendar.ts`: view days, stepping, countdown, overlap lanes) is pure and unit-tested. Meetings come from `list_meetings` (100-day limit). No new database objects.
