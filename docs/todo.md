# To-do

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

Depends on the PT sessions work above.

- [ ] **Navigation:** Home · Mesocycle · Personal training · Nutrition · Progress.
  - [ ] `clientSections` splits per service, and the guards follow.
  - [ ] The phone tab bar labels Personal training "PT" (full name for screen readers); 320px is the target width.
  - [ ] Mesocycle moves to `/mesocycle` and `/mesocycle/:programId`, and `/training/*` redirects there. The Mesocycle list shows mesocycle programs only.
  - [ ] Personal training gets `/personal-training` (the dashboard) and `/personal-training/:programId` (reuses `TrainingProgramView`).
  - [ ] Update Home's service links, back links and activity links.
- [ ] **Dashboard**, laid out like Home:
  - [ ] Top row: "Next session" (`UpcomingMeeting` filtered to PT-tagged meetings) beside "Your program" (the current PT program, plus other published PT programs).
  - [ ] Progress: sessions completed, sessions this month, weekly streak, and attendance rate (completed out of completed + no-show + late-cancelled). A 12-week sessions-per-week column chart, moving `ColumnChart` from `ClientsOverview.tsx` into `components/`.
  - [ ] Upcoming: the next 4 weeks.
  - [ ] History: past sessions, newest first, with "Show more". Rows show notes and file markers and open the shared notes and resources. Unrecorded past sessions show as "Past" and don't count.
  - [ ] Stats as pure functions in `src/domain/scheduling/ptStats.ts`, with unit tests.

## Small follow-ups offered

- [ ] Optionally show the mesocycle progress bar on the coach's client log view too (client-only today).
- [ ] Optionally use the grey inbox icon for the other "all clear" states on the Clients page ("All caught up.", "No upcoming meetings."), which still show the green tick.
- [ ] Optionally apply the roomier card spacing to the service request modal too.
- [ ] `list_pending_service_requests` still returns `unread`, which nothing displays. Drop it, or use it again if an indicator comes back.
