# To-do

## Next up (handoff, 2026-11-20)

Development is moving from Claude Code to Codex. Agent instructions now live in `AGENTS.md` (`CLAUDE.md` just imports it). In priority order:

- [ ] **Reset the local DB first.** Run `pnpm db:start && pnpm db:reset`. Manual testing left state that makes `023`, `026` and `030` fail. Then confirm `pnpm test:db` is fully green and `pnpm test:api` passes.
- [x] **Billing: client screens and "I've sent it"** (decision 0055, built 2026-11-21). Manual UI checks are in `docs/status.md`.
- [x] **Payment notices in Activity / To review** (decision 0055 follow-up, built 2026-11-21).
- [x] **Coach search and sidebar clients list** (decision 0054, owner request, 2026-11-21). A ⌘K / Ctrl+K command palette for clients, pages and sections; active clients nested under Clients in the sidebar. Manual UI checks are in `docs/status.md`.
- [x] **Skeleton loading** (decision 0056, owner request, built 2026-11-21). Manual UI checks are in the decision record.
- [x] **Help pages for coaches** (decision 0057, owner request, built 2026-11-21). MDX pages with live examples and section search. Manual UI checks are in the decision record.
- [x] **Help phase 2** (decision 0057, "Phase 2 plan"), in this order:
  - [x] `<Demo>` player (autoplay in view, Pause, reduced-motion final frame) and spreadsheet demos 1 to 3 (built 2026-11-21; waiting for the owner's review before more demos).
  - [x] Separate Mesocycle and Personal training pages, with shared editor text (built 2026-11-21).
  - [x] More editor detail and step-by-step guides in the shared editor text, with the paste review and publish readiness demos (built 2026-11-21).
  - [x] New pages: Roles and permissions, What clients see. (built 2026-11-21)
  - [x] Nutrition demos: a week filling in, and missing entries with a correction (built 2026-11-21).
  - [x] Meetings, new Availability and open times page, and Billing, with demos 7 to 10. (built 2026-11-21)
  - [x] Fill in Clients, Activity, Nutrition, Profile settings and Getting started, then an accuracy pass (built 2026-11-21).
- [x] **Client menu** (decision 0058, owner request, built 2026-11-21): Meetings and Billing in the client menu, with services under one Services item when there are two or more. Manual UI checks are in the decision record.
- [ ] **Owner's manual UI checks** for decisions 0043–0054 (checklists are in each decision record and in `docs/status.md`).
- [x] **Scheduling phase C** (decision 0050, built 2026-11-21): a client list of all upcoming meetings, each with the reschedule/cancel dialog. Manual UI checks are in the decision record.
- [ ] Pick the next roadmap milestone. Audit M4–M6 exit criteria first (see "Handoff" in `AGENTS.md`).
- [ ] Later candidates: Playwright e2e tests (promote the smoke script to `tests/e2e`), ESLint and a formatter, an `audit_events` table. The owner's backlog is at the end of "Next milestone" in `docs/status.md`.

### Things to know

- The repo is public on GitHub as a portfolio project. Don't commit anything from `samples/`; it's MPS intellectual property and gitignored. Keep local seed people fictional on `@example.test`.
- Never run browser automation or screenshots without the owner's explicit OK for that round.
- The local stack may still have an unrelated Supabase project running (`mps-demo-verification`). Stop it with `pnpm exec supabase stop --project-id mps-demo-verification` if ports clash.

## Planning session, 2026-11-20

Open work from the 2026-11-20 planning session. Done so far: answered requests leave "To review" (decision 0043), required-field asterisks, mesocycle progress on the program page, and service request answers (decision 0044). See `docs/status.md`.

## Housekeeping

- [x] Commit the work so far (one commit, including the earlier MeetingsCard, sidebar glow and `index.css` changes, which share hunks with it).
- [x] Restore Maya's local services. `pnpm db:reset` on 2026-11-20; full pgTAP suite passes (834).
- [ ] Manual UI checks for everything above (checklists in decisions 0043 and 0044 and in the chat).

## PT sessions: coach view (plan item 4)

Done: decision 0047. Manual UI checks pending. One change from the plan: the attendance to-dos are one card per meeting, under a "N past sessions need attendance" heading.

- [x] **Attendance.** Once a meeting has started, its dialog offers **Completed** and **No-show** (existing `completed` and `no_show` statuses, already frozen at the DB layer).
  - [x] `correct_attendance(id, status, reason)` writes to a new `meeting_attendance_changes` audit table and can set a meeting back to "not recorded".
  - [x] Meetings page to-do: "N past sessions need attendance", reusing the existing to-do list.
- [x] **Shared notes.** A new `meeting_shared_notes` table, separate from the staff-only `meeting_notes`, so no policy change can expose private notes.
  - [x] Written by `save_meeting_shared_notes`. Clients read their own; staff read clients they can access.
  - [x] `meeting_document` gains `sharedNotes`. The meeting dialog gets a "Shared with client" field; existing notes are labelled "Private to staff".
- [x] **Resources** (always shared with the client).
  - [x] Private `meeting-resources` bucket (images, video, PDF; 50 MB cap) and a `meeting_resources` table. Link resources too, for long videos.
  - [x] Uploads go to `{client}/{meeting}/{uuid}.ext`; `add_meeting_resource` checks the path and records the row. Clients read through signed URLs, as with profile photos.
  - [x] The meeting dialog lists resources, with upload, add link and remove. Removing deletes the file and the row.
- [x] **Meetings card:** an Upcoming / Past switch. Past shows the latest 5, then "View all", which opens a full history page, `/coach/clients/:id/meetings`, modelled on Recent updates → activity history.
- [x] **Pattern changes:** ending a pattern also keeps meetings that have shared notes, resources or recorded attendance.
- [x] RLS, grants and pgTAP tests in the same migration for every new table, function and bucket.
- [x] Backlog note: cascading deletes (client or service) remove resource rows but not their stored files.

## Client Personal training page and navigation (plan item 3)

Depends on the PT sessions work above. Done: decisions 0051 (navigation) and 0052 (dashboard). Manual UI checks pending. One change from the plan: the weekly chart uses `ColumnTrend` (moved to `components/`), not `ColumnChart`.

- [x] **Navigation:** Home · Mesocycle · Personal training · Nutrition · Progress.
  - [x] `clientSections` splits per service, and the guards follow.
  - [x] The phone tab bar labels Personal training "PT" (full name for screen readers); 320px is the target width.
  - [x] Mesocycle moves to `/mesocycle` and `/mesocycle/:programId`, and `/training/*` redirects there. The Mesocycle list shows mesocycle programs only.
  - [x] Personal training gets `/personal-training` (the dashboard) and `/personal-training/:programId` (reuses `TrainingProgramView`).
  - [x] Update Home's service links, back links and activity links.
- [x] **Dashboard**, laid out like Home:
  - [x] Top row: "Next session" (`UpcomingMeeting` filtered to PT-tagged meetings) beside "Your program" (the current PT program, plus other published PT programs).
  - [x] Progress: sessions completed, sessions this month, weekly streak, and attendance rate (completed out of completed + no-show + late-cancelled). A 12-week sessions-per-week column chart, moving `ColumnChart` from `ClientsOverview.tsx` into `components/`.
  - [x] Upcoming: the next 4 weeks.
  - [x] History: past sessions, newest first, with "Show more". Rows show notes and file markers and open the shared notes and resources. Unrecorded past sessions show as "Past" and don't count.
  - [x] Stats as pure functions in `src/domain/scheduling/ptStats.ts`, with unit tests.

## Small follow-ups offered

- [x] Optionally show the mesocycle progress bar on the coach's client log view too (client-only today).
- [x] ~~Optionally use the grey inbox icon for the other "all clear" states on the Clients page.~~ Declined (2026-11-20): the owner prefers the green tick for "All caught up." and "No upcoming meetings."; only Follow up's "All done here." uses the inbox.
- [x] Optionally apply the roomier card spacing to the service request modal too.
- [x] `list_pending_service_requests` still returns `unread`, which nothing displays. Dropped (migration 00050).
