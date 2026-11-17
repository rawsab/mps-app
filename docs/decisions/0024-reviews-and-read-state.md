# 0024 — Reviews: cross-client activity with read state

Date: 2026-11-17 · Status: accepted

- **Reviews is the notifications page.** PRD §6 already lists Reviews in Matt's navigation ("recent logs, submitted check-ins, and items awaiting attention"), so client activity lands there rather than in a new sidebar item. The page lists sessions from every client the staff member can see, newest first, grouped by day, with All/Unread filters and "Mark all as read". Each item names its client and opens that logged day.
- **Client changes only.** `private.session_activity` (shared with the client page feed from decision 0023) now also returns `client_activity_at`: the latest change whose `updated_by` is the client. Reviews time items by it and leave out sessions only staff have touched, so a coach's correction never notifies anyone. Known limit: a coach overwriting the client's only row loses that row's client timestamp until `audit_events`.
- **Read state per staff member.** `staff_activity_reads` holds one watermark ("mark all as read"); `staff_activity_seen` holds per-session seen times (opening an item from Reviews or Recent updates). An item is unread while the client changed it after both, so a new log on an already-seen session comes back. Marking all deletes the seen rows the watermark covers. A staff member with no row sees all past activity as unread.
- **Access.** Tables are SELECT-own-rows; writes go only through `mark_activity_read` (security definer, `search_path = ''`, staff check plus `staff_can_access_client` for a single session). Reads are security invoker, so RLS on sessions and clients limits a coach to assigned clients.
- **Badge.** The sidebar shows the unread count on Reviews (a dot when collapsed and on the mobile menu button), polled every 60 seconds since client logs arrive without coach action. Realtime can replace polling later.
- **Not done:** check-ins and nutrition join with M5/M6; email or push notifications are out of scope.
