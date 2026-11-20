# 0047 — Attendance, shared notes and resources on meetings

Date: 2026-11-20 · Status: implemented (owner request), manual UI verification pending · Extends 0037 and 0039

- **Scope addition, recorded rather than resolved silently.** PRD §3 excludes booking and billing, and decision 0037 planned attendance for phase 4. The owner brought attendance forward for the coach's PT view. Billing stays out; attendance status stays separate from any charge decision.

## Attendance (migration 00046)

- Once a meeting has started, its dialog has an attendance dropdown (Not recorded, Attended, No-show). Choosing Attended or No-show records it at once (`record_attendance`). These are the existing `completed` and `no_show` statuses, frozen at the DB layer since 0037. A meeting with a pending client request must be answered first; cancelled meetings have nothing to record.
- **Corrections:** changing the dropdown on a recorded meeting offers an optional reason (owner request), then `correct_attendance(id, status, reason)` changes it to the other status, or back to "not recorded" (`scheduled`).
- **Audit:** every recording and correction writes `meeting_attendance_changes` (from, to, reason, who, when; staff only). The frozen-meeting guard lets a recorded status move only when a matching audit row exists in the same transaction, so nothing can bypass the audit. A `seq` column orders changes that share a transaction time.
- The dialog shows the change history once a correction exists, with names from `meeting_coach_card` (coaches can't read each other's profiles).
- **To-dos:** ended meetings without attendance first appeared as cards in the Meetings page to-do strip. Decision 0048 moved them into a Record attendance section.

## Shared notes

- `meeting_shared_notes` is a separate table from the staff-only `meeting_notes`, so no policy change on private notes can expose them. It's written by `save_meeting_shared_notes`. Clients read their own; staff read clients they can access.
- `meeting_document` gains `sharedNotes`. The dialog's Notes section has "Shared with client" above "Private to staff", and pattern notes are labelled private.

## Resources

- Always shared with the client. They're files in the private `meeting-resources` bucket (images, MP4/MOV/WebM video, PDF; 50 MB cap), or https links for longer videos. There are at most 20 per meeting.
- Uploads go to `{client}/{meeting}/{uuid}.ext`. Storage policies allow staff with access to upload, read and delete there. `add_meeting_resource` checks the path belongs to that meeting and that the object exists, then records the row with the size and type that Storage recorded. If recording fails, the browser removes the upload.
- Clients read files through signed URLs, but only files with a `meeting_resources` row (an unrecorded upload stays unreadable).
- Removing: `remove_meeting_resource` deletes the row and returns the path, then the browser deletes the file through the Storage API (Storage refuses direct SQL deletes). If only the file delete fails, the dialog says the file was left behind.
- **Backlog:** cascading deletes (client, service or meeting) remove resource rows but not their stored files.

## Past meetings and pattern changes

- The client page's Meetings card has a **Next 31 days / Past** switch. Past shows the latest 5 (`list_past_meetings`, newest first, keyset paged), then "View all past meetings". That link goes to `/coach/clients/:id/meetings`, which loads 25 at a time and opens each meeting on the client page (`?session=`), as the Meetings page does.
- Rows show Attended, No-show or "Record attendance" badges, plus Shared notes and resource count markers.
- Ending or changing a pattern also keeps meetings with shared notes, resources or attendance history (`private.meeting_has_history`), and counts them in "kept".

## Verification

- `035_meeting_attendance_notes_resources.test.sql`: 51 pgTAP assertions. Full `pnpm test:db` passes (885).
- `tests/domain/meetingResources.test.ts`: file rules. `pnpm verify` passes with 331 unit tests.
- No browser checks.
