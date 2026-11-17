# 0025 — "To review" summary on the clients page

Date: 2026-11-17 · Status: accepted

- **What it shows.** A full-width "To review" row under the Services / Status / Follow up charts: the unread total (links to Reviews filtered to Unread), unread items by kind in the same column chart as the roster charts (Completed green, In progress gold, Skipped red; labels name every bar), and the latest three unread items as Reviews rows. `LATEST_REVIEWS` in `ClientsOverview.tsx` sets the number. With nothing unread it shows "All caught up."
- **Unread only.** The summary is the coach's backlog, not an activity trend. A 7-day activity view can be added later if wanted.
- **"Started" is never unread.** `private.activity_kind` (migration 00020) classifies sessions as completed, skipped, logged (in progress with sets or Stimulus & Fatigue answers) or started (opened, nothing logged). Opening a day isn't something to review, so started sessions stay in Reviews' All list but carry no dot and don't count anywhere. The badge, summary and dots therefore agree. `activityKind` in `src/domain/activity/feed.ts` mirrors the SQL for wording ("Answered Stimulus & Fatigue" for feedback-only sessions).
- **Data.** `get_review_summary()` counts on the server (staff only, same RLS path as Reviews), so no item list is downloaded for the chart. It polls with the badge; marking read updates it optimistically.

**Revised the same day (owner feedback):** the by-kind column chart was removed. The row is now half "To review" (unread count beside the heading, linking to Reviews' Unread filter, plus the latest three unread items in a compact form: "Client · date" then "What happened (status)") and half "Upcoming sessions" (decision 0026). `get_review_summary()` stays in the database, tested but unused by the UI, for a later breakdown. The "started is never unread" rule stands.

**Revised again (owner request):** started sessions (opened, nothing logged) count as unread again, so they appear in the clients page's recent items, the badge and Reviews' Unread filter (migration 00021). This reverses the "started is never unread" rule above. `get_review_summary()` gained a `started` count so its total still equals the badge.
