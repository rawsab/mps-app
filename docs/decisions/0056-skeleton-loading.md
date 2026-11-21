# 0056 — Skeleton loading

Date: 2026-11-21 · Status: **built 2026-11-21** (owner request; manual UI checks pending) · Extends 0049

Content that loads shows a placeholder in its own shape, not a spinner, so nothing jumps when the data arrives.

## Rules

1. **First load only.** A skeleton shows while a query `isPending`. Refetches keep the old content.
2. **Spinners are for actions:**
   - busy buttons
   - save indicators ("Saving", `DraftSaveIndicator`)
   - quick checks inside dialogs ("Checking program", "Checking logged workouts", "Checking what this service has", "Loading open times")
   - the auth callback ("One moment")

   `tests/lib/loadingStates.test.ts` fails on any other spinner label.
3. **Anything already known renders for real.** Page titles, section headings, tabs and buttons show from the first frame; only the data parts are placeholders. When the title is the data (a client's or program's name), the header is a placeholder too.
4. **Same layout as the real thing.** Each skeleton is built from the real section's grid, Card and spacing, and sits beside it in the same file.
5. **150 ms delay** (`SKELETON_DELAY_MS`, owner choice). Faster loads show nothing at all. After the delay the skeleton fades in over 200 ms. There's no minimum display time.
6. **Text is grey bars.** A line of text becomes a rounded bar (3px radius) about the letters' height, in a line box the height of the real text. Every line but the last is full width; the last is shorter. Avatars are circles and blocks use `rounded-card`.

## Components (`src/components/Skeleton.tsx`)

- `LoadingRegion`: `role="status"` with the existing screen-reader text ("Loading meetings" and so on), announced straight away. The placeholders inside are `aria-hidden` and appear after the delay. Its `className` lays out the placeholders.
- `Skeleton` (moved from `ui.tsx`): one block, with a `shape` of `block`, `text` or `round`.
- Ready-made shapes:
  - `SkeletonText` (`lines`, `size` from xs to the PageHeader title, last-line `width`)
  - `SkeletonHeader` (PageHeader's shape)
  - `SkeletonRows` (list rows: `sm` meetings, `md` activity, `lg` programs)
  - `SkeletonCard`
  - `SkeletonTable`
- Meeting shapes live in `src/features/scheduling/MeetingSkeletons.tsx`: the card, the upcoming rows, `MeetingRow`, and the dialog body.

## App start-up

While the session and account load, the app shows its top bar (logo) and a page of placeholders, not a full-screen spinner. The coach and client layouts differ and neither is known yet, so this frame is shared by both.

## Not changed

- The Meetings calendar already draws its empty grid while meetings load. Its spinner became a screen-reader-only status line.
- The program editor gets a header, a toolbar and a few rows (`SkeletonTable`), not a full fake grid.
- The command palette keeps its one-line "Loading clients and programs…" note.
- There's no component test setup (see 0049), so the delay and the markup are checked by typecheck and in the browser, not by unit tests.

## Manual checks

To see skeletons locally, throttle the network in devtools ("Slow 4G"):

- Sign in: the start-up frame shows the logo bar, a title bar and two cards, then the app.
- Coach screens:
  - Clients: the activity rows, today's meetings, three panels, filters and table rows.
  - A client's page: the header with an avatar circle, then two columns.
  - Activity, Meetings and Billing, plus the meeting dialog opened from Meetings.
- Client screens: Home (to-dos, meeting card, progress), Mesocycle, Personal training, Nutrition, Progress and Billing.
- Fast loads (no throttling) show no flash of grey.
- Reduced motion: the bars don't pulse or fade.
- Light and dark themes: the bars are visible but quiet.
