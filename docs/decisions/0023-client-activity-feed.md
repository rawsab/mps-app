# 0023 — Client activity feed (Recent updates)

Date: 2026-11-17 · Status: accepted

- **Derived from existing records, not an event log.** `get_client_activity` (migration 00018) returns one item per training session, timed by the latest change to the session, its logged sets or its Stimulus & Fatigue answers. Rows keep only their latest state, so the feed says what happened and who touched it last, not earlier values. When `audit_events` lands, the function unions those events (corrections with before/after, publishes, invitations) without changing the item shape; nutrition logs join in M5.
- **One item per session**, not per set, so a workout doesn't flood the feed. New sets on a later day move the session back to the top.
- **Staff only.** Security invoker (RLS still applies to every table read) plus an explicit `staff_can_access_client` check, so a client gets 42501 rather than this view. Pagination uses a `(activityAt, id)` cursor with a 1–100 limit.
- **Coach changes are labelled, not hidden.** `staffEdited` is true when the coach last changed the session, a set or feedback; the item shows "Edited by coach". Coach-only actions (publishing, notes) are out of scope here.
- **UI.** A "Recent updates" card above Programs on the client page shows five items; "View full history" opens `/coach/clients/:id/activity` (a route, not a dialog, so it can be linked and reloaded), grouped by local day with "Load more". Each item opens the coach view of that logged day, and its back link returns to where the coach came from.
- **Not done:** unread/"new since last visit" state and a cross-client feed. Both belong with the Reviews page (PRD §6, M6).
