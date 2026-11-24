# 0063 — Meeting conflicts on the Meetings page

Date: 2026-11-24 · Status: accepted (owner request, 2026-11-24 meeting) · Built

- **Change.** The coach Meetings page has a **Conflicts** section below the to-dos. It shows overlapping meetings with the same coach in the next 100 days. Each conflict is a card with the day and the span it covers, then each meeting (time, client, length, topic) linking to its dialog. The section is hidden when there are none.
- **Rule** (`meetingConflicts`, `src/domain/scheduling/conflicts.ts`, unit-tested). Only scheduled meetings with a coach that haven't ended count. Cancelled, late-cancelled and recorded meetings don't. Ending exactly as the next starts is not a conflict. Overlaps chain: if A overlaps B and B overlaps C, that's one conflict of three, so a card never repeats a meeting.
- **Data.** No server change. It reuses the 100-day `list_meetings` query that Next meeting and Upcoming already load (`useComingMeetings`), so it costs no extra request. That list holds the meetings of every client the viewer can see. An administrator sees every coach's conflicts, with the coach's name shown when more than one coach is involved. A coach sees conflicts among the clients they can access. The save-time "It overlaps …" notice (`coach_overlaps`) is unchanged.
- **Not changed.** The calendar still places overlapping meetings side by side without marking them.
- **Manual checks.**
  - Add two meetings for one coach that overlap (e.g. 10:00 for 60 minutes and 10:30 for 30). Conflicts appears with one card, "10:00 – 11:00", listing both.
  - Open one from the card, move it to 11:00 and save. The card goes away.
  - Back-to-back meetings (10:00–11:00 and 11:00–11:30) show no conflict. Cancelling one of an overlapping pair clears it.
  - As an administrator, overlapping meetings for two coaches show the coach's name on each card.
  - With no conflicts, the section isn't there and the calendar sits where it did.

**Help (2026-11-24).** The card is now `ConflictCard` (`src/features/scheduling/ConflictCard.tsx`), shared by the Meetings page and a Help example (`ConflictsExample`). The example uses fictional meetings, including a back-to-back one that isn't listed, through `meetingConflicts`.
