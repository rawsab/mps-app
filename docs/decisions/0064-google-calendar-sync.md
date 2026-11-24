# 0064 — Google Calendar two-way sync (plan)

Date: 2026-11-24 · Status: **proposed plan, not built** (owner request, 2026-11-24 meeting; open questions below) · Builds on 0037, 0039, 0047, 0050

- **Scope change, recorded rather than resolved silently.** The PRD has no calendar integration, and PRD §3 already lists live Google sync (for Drive) as out of scope. Scheduling itself was added by decision 0037. This plan specifies syncing meetings with Google Calendar. The PRD has not been edited.
- **Not authorized yet.** Building this needs hosted resources: a Google Cloud project, an OAuth client, a consent screen and possibly Google's app verification. AGENTS.md requires explicit authorization for each. Nothing below has been created.

## What the owner asked for

Two-way sync covering: one-off and repeating meetings; meeting descriptions and links; rescheduling; cancelling; inviting clients and notifying them of meetings and changes.

## Principles

1. **The app stays the source of truth.** Meetings, patterns, attendance, late cancellations and billing are decided by the existing SQL functions. Google Calendar mirrors them. Changes made in Google come back through the same functions as a coach's edit in the app, so every rule still holds: frozen attendance, edits waiting while a client request is open, and coach cancellations never counting as late.
2. **Sync never blocks the app.** Saving a meeting never waits on Google. Changes queue and retry, and the coach can see when something didn't sync.
3. **Only shared content leaves the app.** Staff-only notes, pattern notes and private resources are never written to Google. Clients see whatever is in the event.
4. **Per coach.** Each coach connects their own Google account. Meetings sync to the calendar of the coach they belong to (`meetings.coach_id`).

## How meetings map to Google events

- **One-off meeting:** one event.
- **Repeating meeting:** one recurring event (series) per pattern slot. A slot is one week of the cycle, a weekday, a start time and a length. It always repeats every `cycle_weeks` weeks, so it maps exactly to `RRULE:FREQ=WEEKLY;INTERVAL=<cycle_weeks>;BYDAY=<day>`, starting at its first occurrence. "Tuesday every week" is one series. "Monday in week 1, Friday in week 2 of a 2-week cycle" is two series.
  - Each generated meeting row is an instance of its series, matched by `(slot_id, occurrence_on)` ↔ (series id, original start). A moved, resized or cancelled meeting becomes an instance exception.
  - *This and following* (the old pattern ends and a new one starts) sets `UNTIL` on the old series and creates new ones. A paused service ends its series; resuming starts new ones.
  - **Why series rather than one event per meeting:** a client gets one invitation per slot ("Weekly on Tuesday") instead of one email for each of the next 12 sessions. Their calendar also shows a proper repeating event. Times use the pattern's IANA time zone, so a 07:00 session stays at 07:00 across daylight saving, as in the app.
  - Fallback if series prove fragile: one event per generated meeting, created as the hourly top-up generates them, with invitations sent quietly (see question 3).
- **Event content:** title "Personal training with {client}" (or the meeting's topic); start, end and time zone; location and description holding the meeting link; the meeting's client-visible description (new, below); and a link to the meeting in the app. The client is an attendee, using their email in `clients.email`.

## Meeting links and descriptions

- **Links.** Today every meeting uses the coach's profile meeting link (`profiles.meeting_url`). The plan keeps that as the default and adds an option to have Google create a Meet link per series or one-off meeting (`conferenceData`). That link is stored on the meeting or pattern so the app shows the same one.
- **Descriptions.** New client-visible `description` fields on meetings and patterns (a pattern's applies to its meetings unless one has its own). These are separate from the staff-only notes and the after-session shared notes (0047). Each needs RLS, grants and pgTAP like any new column.

## App to Google (outbound)

- Triggers on `meetings`, `meeting_schedules` and `meeting_schedule_slots` add rows to a `google_sync_queue` outbox: what changed, attempts and the last error. A worker Edge Function, run by pg_cron every minute and also kicked after each save, applies them with the Calendar API.
- Creating, moving, cancelling (event or instance cancelled) and reinstating all send `sendUpdates=all`, so Google emails the client the invitation, the change or the cancellation. A coach-chosen "don't notify" option can come later.
- A link table, `google_event_links`, maps meetings, slots and series to Google event ids and stores each event's `etag` or `updated` time. Staff read it; browsers never write it.

## Google to app (inbound)

- **Incremental sync** with Google's `syncToken` on the coach's synced calendar. Phase 2 starts with polling every few minutes from pg_cron, which needs no public webhook and works locally. Push notifications (`events.watch` to a webhook Edge Function that checks the channel token) can be added later to make it faster.
- **What comes back:**
  - Moving or resizing a single meeting (or one instance of a series) in Google moves it in the app, through the same path as the meeting dialog, and marks it `modified`.
  - Deleting or cancelling a single meeting in Google cancels it in the app as a coach cancellation (reason "Cancelled in Google Calendar"), which can be reinstated.
  - Editing a description in Google updates the client-visible description.
  - Attendee replies are shown on the meeting ("Maya declined in Google Calendar"). A decline doesn't cancel the meeting; the client still asks through the app, so the late-cancel rules apply (question 5).
- **What doesn't come back** (shown as "Needs attention" on the Meetings page instead):
  - Whole-series edits in Google (a new time or day for "all events"). Pattern changes have rules (kept meetings, "from a date"), so the coach makes them in the app. Reverting the series automatically is the alternative (question 6).
  - Changes to a meeting that the app has frozen (attended, no-show) or that waits on an open client request. The app's version is pushed back.
  - Events created directly in Google. They're left alone. Later they could be offered as "Create a meeting from this event?", with the coach choosing the client; never matched to a client by email automatically.
- **Loops and races.** Inbound changes whose `etag` matches what the app last wrote are echoes and are skipped. For a real conflict, the app's rule-checked state wins and is pushed back to Google, with a notice to the coach.

## Accounts, tokens and security

- **OAuth:** a "Connect Google Calendar" button in Profile settings starts the server-side OAuth web flow (`google-oauth-start` and `google-oauth-callback` Edge Functions). Recommended setup: a dedicated "MPS sessions" calendar created by the app, under the narrower `calendar.app.created` scope, rather than full access to the coach's own calendar (question 2). Check during setup which scopes Google classes as sensitive, since that decides whether app verification is needed.
- **Tokens:** refresh tokens live in Supabase Vault and are read only by Edge Functions with the service role. They never go to the browser, and `VITE_*` variables are never involved (`src/lib/env.ts` rules). The connection table sits in the `private` schema with no browser grants. A safe view (connected, which calendar, last sync, last error) is exposed to the coach with RLS and pgTAP tests.
- **Disconnect** revokes the token and stops sync. The coach chooses whether to remove future events from Google.
- **Google account type.** A personal Gmail account works, but the OAuth app must be **published** (not left in Testing). In Testing mode, refresh tokens expire after 7 days. Publishing with a sensitive scope needs Google's verification, which can take days or weeks. A Google Workspace account with an Internal app avoids verification but costs a subscription (question 1).

## Phases

1. **Connect and push:** OAuth, the dedicated calendar, the outbox and worker. One-off and repeating meetings with client invitations, descriptions, the meeting link, moves, cancellations and reinstating. A sync status on the Meetings page and the meeting dialog. pgTAP for new tables and functions; unit tests for slot ↔ RRULE mapping and instance matching (including daylight saving and 2–4 week cycles).
2. **Pull:** incremental sync by polling. Single-meeting moves, cancels and description edits apply; replies show; anything else becomes Needs attention.
3. **Optional:** push notifications for faster inbound sync; reading the coach's free/busy so open times avoid their other commitments (0050); "Create a meeting from this event".

## Open questions for the owner

1. Which Google accounts will coaches connect: personal Gmail (needs a published, possibly verified app) or Google Workspace?
2. A dedicated "MPS sessions" calendar (recommended: narrower access, easy to turn off), or the coach's main calendar?
3. Should creating a repeating pattern email the client a Google invitation per slot? Recommended: yes, one per slot.
4. Meeting links: keep each coach's profile link, or have Google create a Meet link per meeting or pattern?
5. When a client declines in Google, should that only show on the meeting (recommended) or open a cancellation request?
6. Whole-series changes made in Google: flag them for the coach to redo in the app (recommended), or revert them automatically?
7. Should Google's emails replace the app's own meeting emails once those exist, or should both be sent?
