# 0050 — Coach availability and client meeting requests

Date: 2026-11-20 · Status: accepted (owner request) · Phase A built

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
  - Profile settings has an Availability card: a weekday editor with several ranges per day, "Copy to Tuesday–Friday", and the booking rules.
  - The Meetings page lists upcoming time off and extra hours (add, edit, remove).
  - The calendar's week and day views shade time outside the coach's windows, and month view marks time-off days.
- **Seed.** `supabase/seed/availability.sql` sets:
  - Matt: Mon–Thu 9–5, Fri 10–4, a vacation week, a Saturday of extra hours, and a long lunch.
  - Priya: weekday mornings with a lunch break.

**Phases.** A (done): migration 00049, 40 pgTAP assertions (`038_coach_availability.test.sql`), the coach screens above. B: the client's reschedule/cancel dialog on Home's next meeting. C: a client list of all upcoming meetings using the same dialog.
