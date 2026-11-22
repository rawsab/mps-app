# 0050 — Coach availability and client meeting requests

Date: 2026-11-20 · Status: accepted (owner request) · Phases A–C built

- **Scope.** PRD §3 excludes booking. Decisions 0026 and 0037 recorded meeting scheduling as a scope addition, and this extends it so clients pick from the coach's open times when they ask to reschedule. It is still a request: nothing moves until the coach accepts, and only coaches refuse. The PRD has not been edited.
- **Owner decisions (2026-11-20).**
  - Clients pick from open times rather than suggesting any time.
  - A pending request holds its time.
  - Coaches set the booking rules.
  - Extra one-off hours are in scope.
  - "None of these work" sends a request with only a message.
  - Cancel ships with Reschedule.
  - A request inside the late window warns the client and is never refused.
  - The first release covers the next meeting on Home; any upcoming meeting comes next.
- **Working hours.** `coach_working_hours` holds wall-clock ranges per ISO weekday in the coach's **current** profile time zone. Unlike meetings, which keep their zone, hours follow a time zone change. `save_working_hours` replaces the whole week and merges overlapping or touching ranges, so a meeting can run across a split like 9–12 and 12–5.
- **Time off and extra hours.** `coach_availability_exceptions` has one table with a `time_off | extra_hours` kind. Entries are instants, with `all_day` used only for display, and an id chosen by the browser so retries are safe. Notes are staff-only. Time off never cancels meetings; saving it returns the scheduled meetings inside it as a warning.
- **Booking rules.** Three new `profiles` columns:
  - `booking_notice_hours`: default 12, 0–168. The soonest time a client can pick.
  - `booking_horizon_days`: default 28, 1–90. How far ahead they can pick.
  - `booking_buffer_minutes`: default 0, 0–120. Kept free before and after meetings and held times.
  - They are saved through `save_booking_rules`. `save_scheduling_settings` is unchanged.
- **Windows and open times (SQL only).**
  - `private.availability_windows` expands weekly hours per local date, adds extra hours and subtracts time off. It uses `tstzmultirange` and keeps wall clock across daylight saving.
  - `private.open_slots` offers start times every 15 minutes where the meeting's length fits a window. It excludes times inside the notice or past the horizon, the coach's scheduled meetings, and other meetings' held times, each with the buffer.
  - `list_open_times(meeting)` returns only start times, plus the coach's zone, the late window and billability, to the meeting's client or staff with access.
  - `list_availability_windows` returns the coach's own windows for the calendar.
- **Holds.** A pending reschedule with a picked time holds it until the request is answered, withdrawn or expires (the meeting starts). `request_meeting_change` takes a per-coach advisory lock and refuses a time that isn't open (`55000`, "that time is no longer available"). Coaches can still accept at any time and add or move meetings anywhere; overlap warnings are unchanged.
- **Requests.** A reschedule now needs a message **or** a picked time. `late` is recorded on reschedules too, as a short-notice flag using the same billable and window rule as cancellations. Accepting a reschedule never records a late cancellation. Older reschedules keep `late` null.
- **Access.** Both tables allow SELECT only, to the owning coach or an admin. Clients and anonymous users read nothing. All writes go through security-definer functions with `search_path = ''`.
- **Coach screens.**
  - Profile settings has an Availability card: a weekday editor with several ranges per day, one line per range, and the booking rules.
  - The Meetings page lists upcoming time off and extra hours (add, edit, remove).
  - The calendar's week and day views shade time outside the coach's windows, and month view marks time-off days.
- **Seed.** `supabase/seed/availability.sql` sets:
  - Matt: Mon–Thu 9–5, Fri 10–4, a vacation week, a Saturday of extra hours, and a long lunch.
  - Priya: weekday mornings with a lunch break.

- **Client screens (phase B).**
  - Home's next meeting has **Reschedule** and **Cancel meeting** while it's scheduled, hasn't started and has no open request. Both open one dialog with a Reschedule | Cancel switch, and the request id is chosen once per dialog.
  - Reschedule: the client picks a day, then a time, from `list_open_times`, shown in their own zone. "None of these work", a coach with no availability, or no open times leave a message-only request. If the time was taken meanwhile, the open times refresh and the message is kept.
  - A billable meeting inside the late window shows a "Short notice" notice before sending. For a cancellation it says the cancellation will be marked late; for a reschedule it says the meeting goes ahead if the coach can't move it. Nothing is refused.
  - A pending request shows on the card with the asked-for time, the message and **Withdraw request**.
  - The latest answer (moved, cancelled, declined with the reply, or expired) shows above the card for 7 days. Dismissing it is remembered in this browser only.
  - Coaches see "Short notice" on late reschedules in the meeting dialog and in Activity; "Late cancellation" stays for cancellations.
- **Client meetings list (phase C, built 2026-11-21).**
  - `/meetings` lists every meeting in Home's 60-day range, across services, grouped by day in the client's **profile** zone (`upcomingByZonedDay`; `upcomingByDay` groups by the browser's zone, which can differ). Days read Today, Tomorrow, then the full date.
  - Each meeting shows its time, coach, length, topic, programs and repeat state, Join call, and the same Reschedule, Cancel meeting, pending state and Withdraw as Home (`MeetingRequestControls.tsx`, now shared by both).
  - Cancelled meetings stay listed, crossed out, as on the PT page.
  - Each meeting is a full-width row behind a gold left rule, with no fill or border (owner request). The time, countdown or status and the actions (Join call, Reschedule, Cancel meeting) share the first line. Below, a details box like the Activity page's facts lists Coach, Topic, Length, Repeats, the call link if it is missing, Programs (each in its own small box with the service's icon and the name, linking to the program), and **Your request** with Withdraw while one is waiting. Cancelled rows fade, with a grey rule and no actions.
  - Home's meeting heading links to it as **All meetings**. The PT page doesn't, since it lists its own sessions. There is no nav item.
  - The page reuses Home's query, so no server changes. Answers to requests still show only on Home.
  - Manual checks: open Home as a client and select All meetings. Check the days and times match the profile zone. Reschedule and cancel a later meeting (not the next one), then withdraw. Check a cancelled meeting is crossed out with no buttons. Check the page at phone width.

**Phases.** A (done): migration 00049, 40 pgTAP assertions (`038_coach_availability.test.sql`), the coach screens. B (done): the client dialog and Home card, `src/domain/scheduling/requests.ts` with unit tests. C (done): the upcoming-meetings list above, with `upcomingByZonedDay` unit tests.
