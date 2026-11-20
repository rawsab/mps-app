# 0044 — Answering service requests

Date: 2026-11-20 · Status: implemented (owner request), manual UI verification pending · Supersedes 0042's "no decline yet"

- **Scope addition, recorded rather than resolved silently.** The PRD has no service requests (decision 0042). This adds staff answers to them.
- **Who answers:** any staff member with access to the client (owner choice), not only admins.
  - `accept_service_request` and `decline_service_request` are security definer and check `staff_can_access_client`.
  - Accepting adds the enrollment itself, so coaches who aren't admins can accept.
  - Adding a service by hand from the Services card stays admin-only (RLS insert policy).
- **Data (migration 00041):** `service_requests` gains `outcome` (accepted / declined), `response`, `resolved_at` and `resolved_by`.
  - Status is pending, enrolled or declined. "Enrolled" is still derived, so adding the service by hand also answers the request.
  - Accepting adds an active service from today in the client's time zone. It is refused for disabled clients.
  - Accepting again returns the same answer and adds nothing.
  - Answering locks the client row, so it can't race a new request or a second staff member.
  - A declined request can't be accepted, and an accepted one can't be declined. Declining again returns the first answer.
- **Lists:** `list_pending_service_requests(p_client_id)` serves both screens through one query key, newest request first (left to right in the Clients page strip, top to bottom on the client page). Every answer refreshes requests, clients and Reviews, and the list refreshes every minute so other staff's answers appear.
- **Coach screens:**
  - Client page: pending requests appear as dashed rows at the top of Services, with Accept and Reject.
  - Clients page: "Service requests" has its own row under the Services, Status and Follow up charts (owner request). It's one sideways-scrolling strip of request cards, with ‹ › buttons that show more to either side. The buttons appear only when the strip overflows and are disabled at each end. With no pending requests, the row is hidden. Answering the last request folds it away (height and fade, the dashboard's `.collapsible`), and the table moves up; a new request unfolds it again. It never animates on page load.
  - Cards have a plain border, and the note shows up to two lines, then "…".
  - Cards carry neither an unread dot nor a profile picture (both tried, then dropped at the owner's request). Opening a card still marks the request read in Reviews. `list_pending_service_requests` still returns `unread` (migration 00043), but nothing displays it.
  - Clicking a card opens the request: the client (picture, name linking to their page, email, status), the requested service and date, their current services and the full note.
  - Accept there adds the service; the modal is the confirmation. Reject switches the modal to an optional reply, which is shown to the client.
  - The cards hold no buttons (recommended to the owner; awaiting confirmation). Answering from the modal takes the same two clicks a card's Accept plus confirmation did, and a clickable card with buttons inside is awkward for keyboard and screen-reader users.
- **Client Home:** a declined request shows as a dashed "Declined" row with the reply for 14 days, or until the client asks again. The service stays requestable.
- **Editing (migration 00042, owner request):** clients can change or add the note on a pending request from Home ("Edit" / "Add note" on the dashed "Requested" row), through `update_service_request`. An answered request can't be edited. A changed note brings the request back as unread, timed by the edit. Saving the same text again does nothing.
- **Reviews:** a declined request shows a grey "Declined" pill and the reply. Answered requests aren't unread (decision 0043).
- **Verification:** `032_service_request_responses.test.sql` has 27 pgTAP assertions, and the full suite passes (794). `pnpm verify` passes with 319 unit tests. No browser checks.
