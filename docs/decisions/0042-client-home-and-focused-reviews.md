# 0042 — Client Home redesign, service requests and Focused reviews

Date: 2026-11-17 · Status: implemented (owner request), manual UI verification pending

## Client Home (FR-03)

- **Top row:** "Upcoming meeting" beside "Your services", two columns from `md` with a vertical divider (a top rule when stacked, as on the coach Meetings page). Section headings carry icons, as on the coach's client page.
  - **Upcoming meeting** is the client's next scheduled meeting that hasn't ended, from `list_meetings` over the next 60 days (RLS limits it to their own). The card shows the coach's picture and name, then the day, time, length, services, repeating/one-off, linked programs and any pending request, laid out like the coach's next-meeting card. "Join call" opens the coach's link. It's the gold primary button from 15 minutes before the start until the end, and an outline button the rest of the time.
  - **Your services** has no card around it. Each service is a button with ↗ that opens its current program (decision 0039), or the service's list when there is none, including Personal training. "Request a new service" shows while any service is missing and not already requested; requested services show as dashed "Requested" rows.
- **Your to-dos:** only for enrolled services.
  - *Daily nutrition entry* uses the existing rule: today's weigh-in plus yesterday's calories consumed and output. It shows only while a nutrition program covers today.
  - *Next workout* is for the current mesocycle. There's no calendar for program days, so "next" follows program order: a started workout, else one completed today (shown done), else the first day neither completed nor skipped. "5 of 8 exercises logged" uses the day view's rule (`isExerciseLogged`). Done rows show a green check and aren't links; open rows link to the task (the workout opens on its week and day).
  - Personal training has no to-do. PT programs are coach-led.
- **Progress:** mesocycle week and workouts completed (thin gold bar), and the existing nutrition trend chart for the active (else current) nutrition program. "View all progress" opens `/progress`.
- Pure rules live in `src/domain/clientHome.ts` (`tests/domain/clientHome.test.ts`). The old `NutritionHomeTask` is removed.

## Coach name and picture for clients (migration 00038)

- Staff profiles stay unreadable to clients (decision 0027). `meeting_document` now adds only `coachName` (display name) and `coachAvatarPath`, through a definer lookup.
- The `profile-photos` read policy also lets a client read the picture of their primary coach or of a coach on one of their meetings (`private.is_my_coach`). Staff see the same two fields.
- 8 pgTAP assertions (`029_meeting_coach_card.test.sql`).

## Service requests

- **Scope addition, recorded rather than resolved silently:** the PRD has no client service requests.
- `service_requests` (migration 00037), written only by `request_service` (clients, security definer). It accepts one request per service at a time, refuses services the client already has, and is idempotent by client-generated id.
- A request reads **enrolled** once the client has the service, or has had it since sending the request. Otherwise it's **pending**. There's no decline or withdraw yet. A coach who says no leaves the request pending, so the client sees "Requested" until a service is added.
- RLS: clients read their own requests; staff read clients they can access.

## Reviews: Focused filter

- Filters are now All · Focused · Unread (`?filter=focused`). Focused shows service requests and meeting requests only (`get_staff_activity(p_focused)`).
- Badges:
  - service requests: violet "Service Request";
  - cancellation requests: red "Cancellation request";
  - reschedule requests: blue "Reschedule request".
  A pending request has no status pill (owner request, 2026-11-20). Answered ones show their outcome: "Accepted" is green, and declined, withdrawn and expired are grey. Workouts "In progress" are grey (owner request, 2026-11-20).
- **Label change (owner request, 2026-11-20):** cancellation requests were labelled "Meeting cancelled", which misread while pending, because the meeting is only cancelled once the coach accepts. They now read "Cancellation request" whatever the outcome, and the status pill (Accepted, Declined, …) shows the result.
- Service requests count toward the unread badge and "Mark all as read", and open the client's page.

## Coach Meetings page

- While a meeting is running, the headline reads "Join meeting with {client}" (plain text). The running meeting's card replaces the next meeting's card, and the "Now … until …" line is gone.

## Verification

- 30 new pgTAP assertions (`028_service_requests.test.sql`, `029_meeting_coach_card.test.sql`); full `pnpm test:db` passes.
- `pnpm verify`: typecheck, 315 unit tests and build pass. The existing bundle-size warning remains.
- No browser checks were run.
