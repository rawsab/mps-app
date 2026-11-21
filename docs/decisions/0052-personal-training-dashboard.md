# 0052 — Client Personal training dashboard

Date: 2026-11-20 · Status: implemented (2026-11-20 planning session, plan item 3), manual UI checks pending · Builds on 0047 and 0051

- **Route.** `/personal-training` is the dashboard and replaces the interim PT program list from 0051. `/personal-training/:programId` still opens a program.
- **Layout, like Home.**
  - "Your program" on its own row at the top: the current PT program, then other published PT programs.
  - Then "Next session" (Home's `UpcomingMeeting`, narrowed to PT-tagged meetings) beside Upcoming (next 4 weeks, cancelled sessions struck through). The owner moved these on 2026-11-20.
  - Then Progress and History.
- **Stats.** They're pure functions in `src/domain/scheduling/ptStats.ts`.
  - A "PT session" is any meeting tagged `personal_training`, including joint ones.
  - Sessions completed and this month count `completed` only. The month and the Monday-start weeks follow the client's time zone.
  - Weekly streak: consecutive weeks with at least one attended session. The current week adds to the streak but never breaks it.
  - Attendance rate: completed ÷ (completed + no-show + late-cancelled), shown as "—" until there's one of those. Cancelled sessions don't count.
  - An unrecorded past session shows as "Past" and counts nowhere.
- **Chart.** Sessions per week for the last 12 weeks.
  - **Change from the plan:** it uses `ColumnTrend`, moved from `ActivityTrends.tsx` into `src/components/`, not `ColumnChart` from `ClientsOverview.tsx`. `ColumnTrend` is built for time series: sparse ticks, a max label and a screen-reader table. `ColumnChart` compares categories against a total and stays where it is.
- **History.** Ended sessions newest first, 10 at a time with "Show more". In-progress sessions stay out of History; they're the Next session.
  - Rows reuse `MeetingRow` with a new `client` flag, which shows "Past" instead of the coach's "Record attendance".
  - A row opens a read-only dialog with the session's status, shared notes and resources (signed URLs, as in 0047).
- **Data.** No migration.
  - `useAllPastMeetings` pages through `list_past_meetings` 100 at a time to get the whole history for the stats. That's fine for years of weekly sessions. A summary RPC would be the next step if it gets slow.
  - RLS limits the list to the client's own meetings. `035_meeting_attendance_notes_resources.test.sql` now asserts this, with 2 more pgTAP checks.
- **Verification.** `pnpm verify` passes (367 unit tests, 11 in `tests/domain/ptStats.test.ts`). The `035` pgTAP file passes.
  - Four other pgTAP files (024, 026, 030, 031) fail against the current local DB because of state left from manual testing, such as a third active nutrition enrollment. They need `pnpm db:reset`; they aren't affected by this change.
  - No browser checks.
