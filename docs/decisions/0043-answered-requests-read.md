# 0043 — Answered requests are no longer unread

Date: 2026-11-20 · Status: implemented (owner request), manual UI verification pending

- **Problem.** Request rows in Reviews were unread by time alone. A cancellation or reschedule request the coach had already accepted stayed in "To review" on the Clients page, and in the unread count and badge, until someone opened it.
- **Rule (migration 00040).**
  - A meeting request is unread only while it is pending, or after the client withdraws it. Withdrawals still come back unread (decision 0037).
  - Accepted, declined and expired requests are never unread. "Expired" is a reschedule left unanswered until its meeting started.
  - A service request is unread only while it is pending. Adding the service answers it (decision 0042).
  - This applies to every staff member, not only the one who answered. A handled request needs nobody's attention.
- **History.** Answered requests stay in Reviews → All and Focused, with their status badge. Only the unread views drop them.
- **Client.** Answering a meeting request already refreshed Reviews data. Adding a service now refreshes it too.
- **Verification.** `031_resolved_requests_read.test.sql` has 12 pgTAP assertions. The full `pnpm test:db` suite passes (776).
