# 0026 — Upcoming PT sessions (scope addition, preview only)

Date: 2026-11-17 · Status: accepted (owner request)

- **Scope change, recorded rather than resolved silently.** PRD §3 lists "booking" under *Excluded from MVP*. The owner wants Matt to schedule personal training sessions (recurring and one-off) and asked for an "Upcoming sessions" panel now. The PRD has not been edited; scheduling remains unbuilt until it is specified (tables, recurrence rules, time zones, client visibility, RLS and pgTAP as usual).
- **Panel now, data later.** The clients page splits its lower row in half: "To review" (unread count and the latest three unread items, decision 0025) and "Upcoming sessions": today plus the next seven days, grouped Today / Tomorrow / weekday, with time, client, length, location and one-off or ↻ recurring. Rows open the client. "Schedule" is visible but disabled. Six rows at most, then "+N more this week".
- **No mock backend (CLAUDE.md).** `useUpcomingSessions` (`src/features/scheduling/api.ts`) returns labelled sample sessions (fictional seed clients, times relative to now) only when `import.meta.env.DEV`; the panel then shows "Preview · sample data". Any other build shows "Session scheduling isn't set up yet." The production bundle was checked to contain none of the sample data. Delete `sampleSessions.ts` when the real query lands; `UpcomingSession` in `src/domain/scheduling/upcoming.ts` is the shape it should return.

**Revised the same day (owner feedback):** the panel is now "Upcoming today": only today's sessions that haven't finished, soonest first, at most three (`UPCOMING_LIMIT`), then "+N more today". With none left it says "No more sessions today." `upcomingByDay` keeps its multi-day option for a later schedule view.

**Superseded (2026-11-17, decision 0039):** "Upcoming today" reads real meetings, and `sampleSessions.ts` is deleted.
