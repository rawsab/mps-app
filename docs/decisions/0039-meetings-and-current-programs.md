# 0039 — Meetings tagged with services, and current programs

Date: 2026-11-17 · Status: accepted (owner request) · Extends 0037

## Meetings

- **PT sessions became meetings.** Matt also meets clients about mesocycle and nutrition, so every meeting (one-off or repeating) is tagged with one or more of the client's services. At least one service is required; tags must be live (not ended) services, at least one of them active.
- **Renamed now.** Nothing is in production, so migration 00033 renames tables, types and functions from `pt_*` and "sessions" to meetings (`meeting_schedules`, `meeting_schedule_slots`, `meetings`, `meeting_requests`). Recurrence (`private.schedule_occurrences`) is unchanged. The pg_cron job is now `meetings-top-up`.
- **Billing.** Only meetings tagged Personal training are billable (`meetings.billable`, generated). Only billable meetings can be late cancellations, and the database refuses `late_cancelled` on anything else.
- **Generation.** Patterns no longer belong to one enrollment. They generate while any tagged service is active, so a PT + Nutrition pattern continues while PT is paused. Pattern rows say "Paused" when none are active. "Cancel them" on the card stops everything once no service is active.
- **Programs.** Each tagged service can name a program to discuss. Without a choice, the meeting follows that service's current program. When a meeting starts, the hourly job records the program it was following, so changing the current program later never rewrites history. A pattern's chosen programs carry to every meeting it creates.
- **Notes.** Staff-only notes on any meeting, before or after it, kept in `meeting_notes` with staff-only RLS like private coach notes. Making them client-visible later is a one-policy change. Ending a pattern keeps meetings that have notes.
- **Pattern notes** (migration 00035, owner request): a repeating pattern can have its own staff-only notes. They're set when the pattern is created and edited from "Notes" on the pattern, which never changes the pattern itself (changing a pattern starts a new one). A "this and following" change carries them over. Each meeting shows its pattern's notes above its own, so one-off and individual meetings keep separate notes.
- **Meetings card** (was Sessions) shows for any client with a non-archived service. It shows each meeting's services and programs, a "Notes" marker, and a remembered "Hide cancelled (N)" toggle (per browser, `localStorage`, falls back to showing all). The editor and dialogs choose services and programs.
- **Upcoming today** on the clients page now lists today's real meetings across the coach's clients (still to finish, not cancelled, next 3, then "+N more today"). Rows open the meeting. The dev-only sample sessions (decision 0026) are deleted.

## Current programs

- `service_enrollments.current_program_id` / `current_nutrition_program_id` record the coach's choice. They are written only by `set_current_program` (staff with access to the client). They carry no foreign keys: the choice counts only while it matches a non-archived program of that enrollment, so a deleted program leaves a harmless stale id.
- The rule (`private.current_program_id`, mirrored in `src/domain/programs/current.ts`): the choice if still live, else the only non-archived program, else none.
- **Coach:** under each service on the client page, a one-line box shows the current program (truncated with "…", ↗ opens it). With several programs and no choice, it reads "N programs · choose current". "Change" and the Programs card's "Make current" open or apply the choice. The Programs list marks the current program.
- **Client:** Training and Nutrition lists mark the current program. They still list every published program, as the owner asked.

## Also

- Section icons on the coach's client page: Recent updates, Meetings, Programs, Services.
- Backlog: Google Calendar sync for meetings (`docs/status.md`).

## Verification

- 31 new pgTAP assertions (`026_meetings.test.sql`). Suites 023–025 were ported to the new names.
- The full `pnpm test:db` passes.
- `supabase db diff` replayed every migration into a shadow database with no drift from the local one.
- `pnpm verify` passes.
