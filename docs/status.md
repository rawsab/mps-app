# Status

Started 2026-11-16 · Last updated 2026-11-21 · Open work: `docs/todo.md`

## Repository assessment (M0)

- The repo started empty apart from the PRD and roadmap (moved into `docs/` under the names they use for each other), the MPS logos and app icons in `public/`, and three sample source files in `samples/`. There was no prior stack to adapt.
- **Local tooling:** Node 22.18, pnpm 11.9, Docker 28, and the Supabase CLI 2.122 as a dev dependency. No Deno; Edge Functions run in the Supabase local runtime.
- **Not available:** design mockups (the PRD refers to chat mockups; none are in the repo), any hosted Supabase, Cloudflare or Resend credentials, and an altered-layout corpus.
- Decisions: `docs/decisions/0001–0003`.

## Requirement checklist for this increment

| Area | Status | Evidence |
|---|---|---|
| Typed contracts: ranges, loads/efforts, ProgramDraft, NormalizedImport, SourceLocation, ImportIssue | Done | `src/domain/**`, `tests/domain/*` |
| RIR `1-2` stays a range (decision 6) | Done in contracts and importer | `measurements.test.ts`, `programContract.test.ts`, `samples.test.ts` |
| Branded shell, protected client/coach routes, service-filtered client navigation | Done (UI guards are convenience only) | `src/app/*`; headless-Chrome smoke run (below) |
| Sign-in, sign-out, password recovery, invitation callback | Done locally | Invite → Mailpit → callback → set password → sign-in exercised against the local stack |
| Server-side invitation and binding (FR-01) | Done locally | `supabase/functions/invite-client`; 403/400/409/200 paths exercised |
| Migrations: profiles, protected roles, clients, coach assignments, enrollments, RLS | Done | `supabase/migrations/20261116000001_*` |
| Synthetic admin + two-client seed | Done (plus assigned/unassigned coach, disabled, pending) | `supabase/seed.sql` |
| Isolation tests (FR-01, FR-02, NFR-01) | Done: 33 pgTAP + 6 HTTP | `supabase/tests/database`, `tests/policies` |
| Client list, create, enrollments, deactivate/reactivate (FR-02) | Done | `src/features/clients/*` |
| Import feasibility spike (M1) | Done for the supplied samples | `docs/import-spike-report.md` |
| M3 step 1: templates, programs, immutable revisions, content hierarchy, RLS | Done (read-only grants; write functions next) | `supabase/migrations/20261116000002_*`, `002_programs.test.sql` (40 pgTAP), decision 0004 |
| Private coach notes (pulled forward from migration step 5): staff-only table, New client field, client page card | Done | `supabase/migrations/20261116000003_*`, `003_private_coach_notes.test.sql` (12 pgTAP) |
| M3 step 2: `create_program`, `save_draft` (expected version, full contract validation), `get_program_draft`, `publish_revision` (readiness, `can_publish`, atomic pointer move) | Done | `supabase/migrations/20261116000004_*`, `004_draft_save_publish.test.sql` (48 pgTAP), `tests/policies/programDrafts.test.ts` (5 HTTP), decision 0005 |
| M3 step 3: draft command model (update, target, set count, insert, move, duplicate, remove; atomic batches) | Done | `src/domain/programs/commands.ts`, `tests/domain/programCommands.test.ts` (19), decision 0006 |
| Client status derivation: reactivating returns to pending/invited/active from `activated_at` (set on first sign-in), never a browser guess | Done | `supabase/migrations/20261116000005_*`, `005_client_status.test.sql` (9 pgTAP) |
| Clients dashboard (FR-02): service and status charts, invitation follow-ups with send/resend modal | Done | `src/features/clients/ClientsOverview.tsx`, `src/components/Dialog.tsx`, `tests/lib/clientTable.test.ts` |
| M3 step 4a: Grid model (typed columns, row-level rebuild, per-set lists, rectangular paste planning, clipboard) and `setPrescription` command | Done | `src/domain/programs/grid.ts`, `tests/domain/programGrid.test.ts` (14), decision 0007 |
| M3 step 4b: editor shell (program list + create on client page, draft load/autosave, stale-draft conflict with replay/overwrite/discard, device recovery, unsaved-navigation guard, publish with readiness), Program view | Done (browser exercised with step 4c) | `src/features/programs/*`, decision 0007 |
| M3 step 4c: Grid view UI (keyboard navigation, paste preview dialog) | Done | `GridView.tsx`, `PastePreview.tsx`; local browser checks below |
| Program removal (FR-04): delete unpublished programs, archive published; week/day removal in both views | Done | migration `20261116000006`, 16 pgTAP checks, decision 0008 |
| Publishing UI | Not started | — |
| M4 (partial): mesocycle set logging, coach corrections, set totals and change; exercise muscle groups | Done (manual checks pending) | migrations `20261116000015`–`16`, `010`/`011` pgTAP (38), `tests/domain/trainingVolume.test.ts`, decision 0021 |
| FR-08 Stimulus & Fatigue Tracking: per-muscle 0–3 answers on the day view, coach suggestion inline (weekly coach table pending) | Done (manual checks pending) | migration `20261116000017`, `012_muscle_feedback.test.sql` (18 pgTAP), `tests/domain/trainingFeedback.test.ts`, decision 0021 |
| Coach client page: Recent updates card and full activity history (sessions, sets, Stimulus & Fatigue; coach edits labelled) | Done (manual checks pending) | migration `20261116000018`, `013_client_activity.test.sql` (15 pgTAP), `tests/domain/activityFeed.test.ts`, decision 0023 |
| Reviews (coach notifications): cross-client activity, unread filter, mark all read, sidebar unread badge | Done (manual checks pending) | migration `20261116000019`, `014_staff_activity_reviews.test.sql` (21 pgTAP), decision 0024 |
| Clients page lower row: "To review" (unread count, latest 3 unread, compact rows; started sessions count as unread, migration `20261116000021`) and "Upcoming today" preview (next 3 of today's sessions; sample data in local dev only; booking is a recorded PRD scope addition, decision 0026) | Done (manual checks pending) | migration `20261116000020`, `014_staff_activity_reviews.test.sql` (26 pgTAP), `tests/domain/activityFeed.test.ts`, `tests/domain/upcomingSessions.test.ts`, decisions 0025–0026 |
| Client Home redesign (FR-03): next meeting, service links to current programs, to-dos (daily nutrition, next workout), progress glance; client service requests; Reviews Focused filter | Done (manual checks pending) | migrations `20261117000037`–`38`, `028_service_requests.test.sql` + `029_meeting_coach_card.test.sql` (30 pgTAP), `tests/domain/clientHome.test.ts`, decision 0042 |
| M3 step 5: client Training view (read-only): published program list, week → day view with shared sections, supersets, per-set targets, alternatives, notes, demo links and resources | Done (manual phone check pending) | migration `20261116000014`, `009_client_training_read.test.sql` (14 pgTAP), `tests/policies/clientTraining.test.ts` (4 HTTP), `tests/domain/clientView.test.ts` (9), decision 0020 |
| Demo programs in the local seed: realistic mesocycles and PT plans modelled on `samples/`, generated from `scripts/seed/`; fix for the `programTheme` regression in `revision_document` | Done | `supabase/seed/programs.sql`, migration `20261116000013`, `tests/domain/seedPrograms.test.ts`, decision 0019 |

## Checks performed (2026-11-16)

- `pnpm typecheck`: clean.
- `pnpm test`: 65 unit tests passed (contracts, notation, Excel dates, importer preflight, synthetic variations, sample expectations, env guard).
- `pnpm test:db`: 33 pgTAP assertions passed. As a sanity check, loosening `clients_select` to `using (true)` made 6 assertions fail; the policy was then restored.
- `pnpm test:api`: 6 HTTP isolation tests passed against the local stack. They cover anon, client A/B, forged ids, embedded joins, self-promotion, rebinding, and a disabled client with a live session.
- `pnpm build`: succeeds. The built bundle contains neither local secret key; the only `service_role` string is the guard's literal.
- **Headless Chrome smoke test** (system Chrome via playwright-core from a scratch directory, not a project dependency):
  - bad-password error
  - client A lands on Home with four tabs and no page overflow at 320px
  - client A is redirected away from `/coach`
  - client B has no Nutrition tab, and `/nutrition` redirects
  - the disabled client gets "No active access"
  - admin create-client validation, creation and detail page
  - the unassigned coach sees an empty list, with no overflow at 390px

## M3 step 4c verification (2026-11-16)

- `pnpm verify`: typecheck, all 108 unit tests and production build pass.
- Local Playwright browser checks against the real seeded Supabase stack: create a temporary program, add two exercises in Program view, edit sets and per-set targets in Grid, preserve rejected date-like RIR text when switching views, discard with Escape, reject a bad rectangular paste without changing cells, correct and apply the complete batch, autosave and reload. Also checked type-to-edit retains the first character, rectangular selection/copy/clear, day/week duplication, confirmed day/week removal (including cancel), and deletion of the temporary unpublished program. It was removed after verification.
- At a 390px viewport, document width remained 390px; the grid scrolls within its container. No browser console errors observed.
- `pnpm exec supabase test db supabase/tests/database/006_remove_program.test.sql`: all 16 assertions pass (anon/client/unassigned denial, archive permission, direct-table denial, stale versions, deletion cascade, published immutability, archive preservation, archived-save denial).
- Full `pnpm test:db` on the populated development database: six assertions in `002_programs.test.sql` fail because they assume only their fixture programs/revisions exist. Local programs already exist, so the suite needs a clean seeded database for its global-count assertions. The database was not reset. Other existing test files passed; the new removal test was fixed and rerun successfully in isolation.
- Browser automation is still a scratch CLI workflow; promotion to repository e2e tests remains step 5.

## Grid workflow refinements (2026-11-16)

- Added the attached, full-width bottom `+` tab; missing initial workout structure is created atomically and the exercise name receives focus.
- Added shared, session-scoped Undo/Redo across Program and Grid, with atomic batch history, retained identities on duplicate/redo/replay, and normal autosave of undo/redo edits.
- Replaced fixed-choice cells with dropdowns (Per side, Load mode, Unit), removed both instructional paragraphs, and added overflow gradients at the visible table edges. The user requested removal of the “More columns” rectangle; the final version uses gradients only.
- `pnpm verify`: all 135 unit tests, typechecking and build pass. New domain checks cover reversible commands, exact subtree/per-set restoration, stable duplication replay, failed-batch atomicity, empty/existing/shared row insertion, and week/day/section creation with undo and invalid-parent protection.
- Initial browser checks, before the user's manual-verification preference: row creation/focus, undo after autosave and across views, mode/value completion, paste undo as one operation, shortcuts, redo branching, removal restoration, full-width tab geometry and no page overflow at 390px passed. Final gradient-only styling is left for the user to check.
- Additional requested refinements: the bottom `+` tab is now 28px high; gradients shade dark in dark mode and fade in/out over 200ms (respecting reduced motion). Grid’s **Add…** dialog creates named weeks/days/sections in a selected location, each with a visible starter exercise and one-step undo. These changes received code checks only; the user will verify appearance and interaction.
- Duplicate day/week and Remove day/week now live in the cell right-click menu instead of the toolbar. Actions use the clicked cell’s day/week, support keyboard context-menu access, and retain removal confirmation/undo. Code checks pass; manual interaction verification remains with the user.
- Going forward, do not run browser automation or screenshot analysis without explicit user approval; this is recorded in `CLAUDE.md`.

## App layout review and implementation (2026-11-16)

- Owner approved the source-based taste-skill plan before implementation (decision 0009). Program view now uses a responsive week/day outline and one workout workspace, open section headings, aligned exercise rows, expandable details and contextual structure actions.
- Client detail puts Programs first, with services and recent notes beside it on desktop. Lists use dividers, program lifecycle actions use a labelled disclosure, and settings collapse separately.
- Publish readiness is accessible from the toolbar and links to fields; rejected text is included in the review. Program/Grid selection survives view switching. Archived drafts retain navigation with disabled editing controls.
- Shared labels, error descriptions, keyboard tabs, skip links and action targets were improved; paste review shows Before/After columns. The approved accessibility pass increases Grid's attached add-row target to 44px.
- Verification: typecheck, all 141 unit tests and production build pass; the existing large-bundle warning remains. No browser automation, screenshots or taste gate ran. Manual UI checks remain with the owner.

## Weekly spreadsheets and editor disclosures (2026-11-16)

- Owner-approved changes implemented in decision 0010: separate weekly grids, shared preparation shown once, editable week/day names, workout and exercise/superset moves, and sheet-specific add-row/paste behavior.
- Program view adds day/section/exercise icons, independent section/exercise collapse, and a faint gold focus surface that fades in/out. Publish links reopen collapsed ancestors. Smaller plus-icon Add week/Add day buttons sit below their respective outline lists.
- All 149 unit tests, typecheck and production build pass. Eight new tests cover sheet boundaries, insertion and reversible moves. No browser automation/screenshots were run; manual appearance and interaction checks remain with the owner.
- Retained the existing grid implementation; no spreadsheet-library dependency was introduced.

## Grid drag selection (2026-11-16)

- Mouse/pen drag now selects rectangular cell ranges within one week, with edge scrolling and release/cancel handling. Selection connects to existing copy and Delete/Backspace actions. Dropdown editors open through their arrow or Enter/F2/double-click; native text editing and touch scrolling remain available.
- All 149 unit tests, typecheck and production build pass. The existing bundle warning remains. Browser verification was not run; manually check forward/reverse dragging across dropdown columns, release outside the grid, copy/clear/undo and ordinary cell editing.

## Merged spreadsheet labels (2026-11-16)

- Week names now appear as headings with pencil-triggered inline editing, directly above their spreadsheets. Removed the day-name/move controls above each table. Day names can be edited in their Day cells using the pencil or normal grid editing keys.
- Day and Section cells span their exercise rows by identity, with a thicker divider between days. Week prefixes are omitted from day labels. Logical keyboard/clipboard columns and pointer hit-testing account for the merged cells.
- All 158 unit tests, typecheck and production build pass. New coverage checks spans, same-name/different-identity groups, logical columns, merged-cell hit-testing and day rename/undo. No browser automation/screenshots ran; manually check week/day renaming, merged labels/dividers, dragging and keyboard/copy/paste across grouped rows, and both themes.

## Clear draft names and complete them before publish (2026-11-16)

- Per owner request, clearing selections now clears exercise names and Day/Section labels. Blank names persist in drafts and can be restored with Undo. Both editor and server block publishing until the required names and labels are filled; readiness links navigate to their fields (decision 0011).
- Day/Section cells have no pencil; double-click or Enter/F2 edits them directly. Day separators are thin again. Week headings retain their pencil.
- All 165 unit tests, typecheck and build pass. Local migration 00007 is applied; all 20 new database assertions pass for blank-name saves, publish refusal/repair, access isolation and immutable published names. No database reset or browser verification was performed.

## Automatic numbering and day Focus (2026-11-16)

- Weeks and days are now numbered from their current positions in both editors, with no rename controls. Each day has optional Focus (e.g. Legs, Pull, Push). Grid shows Focus below its fixed day number in the merged Day / Focus cell; Program view has a Focus field. Existing descriptive day labels are preserved as Focus (decision 0012).
- Clearing Focus leaves the generated day number intact. Empty Focus does not block publishing; section/exercise names and prescription readiness still do. Local migration 00008 is applied.
- All 171 unit tests, typecheck, build and 20 relevant database assertions pass. No database reset or browser checks ran. Manual appearance and interaction checks remain with the owner.

## Clear-range regression and optional Per side (2026-11-16)

- Clearing now builds valid empty draft values directly, preventing load dependencies from refusing a range that includes exercise names. Dependent rejected-cell buffers are cleared too. The operation remains one undoable batch.
- Per side is optional: its blank grid option renders empty, and Program view labels the checkbox optional. Clearing it preserves unselected reps/time.
- All 174 unit tests, typecheck and build pass. Three regression tests cover multi-row name/per-side clearing, a partial load dependency, and optional blank/per-side-only clearing. Browser checks remain manual: drag a range containing Exercise and Per side, Delete, Undo, and choose the blank Per side option.

## Compact grid add menu and disclosure chevrons (2026-11-16)

- The spreadsheet's bottom + tab is 28px high and opens a menu for New exercise, New section or New day. Section/day setup starts in that sheet's week; adding a section in an empty week creates its first day in one undoable operation.
- All native disclosure indicators now use a shared chevron with a 180ms rotation, including Client settings, sections, exercises and Exercise details. Reduced-motion preferences disable the animation.
- All 176 unit tests and the production build/typecheck pass. Two added tests cover section creation in an empty week and stale-week rejection. No browser checks ran. Manually check the + menu choices and week placement, and expand/collapse Client settings and editor disclosures.
- Owner preference: keep future verification minimal and targeted to the change.

## Contextual grid actions and week motion (2026-11-16)

- Removed redundant grid header actions. Compact, icon-labelled context menus now insert exercises, sections or days above/below the clicked item, with one-step Undo.
- Week three-dot menus append duplicates, confirm deletion, and reorder with animated layout transitions. New copies scroll into view and briefly receive a faint gold highlight. Reduced motion is respected (decision 0013).
- Publish issues/counts have caution icons and smooth navigation; Grid view stays active for grid destinations. Invalid cells show an error surface with hover messages. Selected-day scrolling, program-link padding, creation/service icons, and shared disclosure chevrons are in place.
- Staff can delete their own client notes with confirmation. Migration 00009 is applied locally and enforces authorship plus client access.
- Minimal verification: targeted grid suite (21 tests), note database suite (18 assertions), production build/typecheck; later navigation refinement typechecked. No browser checks or database reset. Manual checks remain for animations, menu placement, hover tooltips, note deletion and scrolling.

## Client settings expansion (2026-11-16)

- Client settings now expands/collapses over 240ms with a subtle fade and rotating chevron. Closed controls are inert; reduced motion disables the transition. Typecheck passed. Manual check: open/close and quickly reverse the toggle.

## Client last-edited column (2026-11-16)

- Clients table now includes sortable Last edited using the client record's existing `updated_at`, newest first on initial sort. Hover shows the full local date/time. Typecheck passed; no schema changes or browser checks.

## Mesocycle Program Style and Program Theme (2026-11-16)

- Mesocycle titles are now labelled Program Style and remain the main heading. A separate saved Program Theme appears as the subtitle in the editor and client program listing. Both are editable in Program details; personal training retains Title (decision 0014).
- Local migration 00010 adds revision-owned Theme with existing RLS and published immutability. Older documents remain compatible. The draft-reader helper retains its authenticated invoker grant.
- Build/typecheck, 46 targeted unit tests and 74 affected database assertions passed. No database reset or browser checks. Manually check the heading/subtitle, save/reload and Undo.

## Grid row dragging and rectangular selection (2026-11-16)

- Normal dragging from # through Notes moves exercise rows; Shift-drag and Shift-click extend rectangular cell selection. Native editors and touch scrolling are preserved (decision 0015).
- Moves work within/across existing sections, days and week sheets, with drop markers and edge scrolling. Empty destinations are exposed; supersets stay together, identities/prescriptions are retained, # recalculates, and Undo restores the whole move.
- Targeted grid suite: 27 tests passed. Production build/typecheck passed. No browser checks; manual verification remains for drag/drop, Shift selection, edge scrolling and Undo.

## Mesocycle grid RIR goal column (2026-11-16)

- Mesocycle grids show RIR goal immediately after Exercise (updated per owner correction). Selection, keyboard navigation, row focus, clipboard mapping and paste previews use that display order. Personal-training columns retain their order and RIR label.
- Typecheck and the targeted grid suite (28 tests) passed, including a paste spanning RIR goal, Exercise and Sets. Manual check: the mesocycle header/order and editing focus.

## Spreadsheet section/day dragging (2026-11-16)

- Day and Section cells now drag their complete structures. Sections reorder or move into other days; days reorder or move between week sheets, including empty destinations. Shift gestures keep rectangular selection, and the gesture hint now explains all three drag sources (decision 0016).
- Changed day numbers blur/fade out before their new numbers come into focus. Reduced motion updates them immediately. Moves retain identities/prescriptions, follow focus and remain one-step undoable.
- Targeted spreadsheet suite: 32 tests passed; production build/typecheck passed. No browser checks. Manually verify section/day dragging, renumber animation, empty destinations, Shift selection and Undo.

## Ended service archiving and service menus (2026-11-16)

- Service actions now sit beside the service name in a right-aligned three-dot menu: text-only Pause/Resume and End. Ended services have an archive-box button after their Ended pill.
- Archiving persists and hides the ended service from the Services card while retaining linked programs/history. Local migration 00011 restricts archiving to ended services under existing admin-only management RLS (decision 0017).
- Typecheck and eight targeted database assertions passed. No database reset or browser checks; manually verify menus, archive placement and persistence after reload.

## Week section controls and client program list (2026-11-16)

- Section grouping is a per-week setting, off by default. The same Use sections checkbox appears on both the week settings page and each day page; toggling either updates that week. Spreadsheet mode exposes it in the week's menu and hides the Sections column when off. List View shows exercises directly under the day while grouping is off. The info icon has an explicit hover/focus tooltip.
- In List View, exercise headers can be dragged to reorder exercises, drop around another exercise, move into a section, or append to a day. Supersets move together using the shared grid move planner.
- The client Programs card has All, Mesocycle, Personal Training and Nutritional filters, service-specific icons and newest-edited-first ordering based on revision `updated_at` (with program creation time as fallback). Nutrition remains a separate data model and is not yet returned by the workout-program query.
- Week day summaries distinguish muted day numbers from darker focus text. Week settings draw a divider after the final workout day.
- Verification for this batch: typecheck and diff checks passed; no tests or browser checks run.

## Client Training view (2026-11-16)

- `/training` lists the client's current published programs (service icon, title, mesocycle theme, week count, last publish date). `/training/:programId` shows week pills, a day grid, and the selected day. The selection is kept in the URL. Shared preparation and cool-down sections are collapsed around each day. Each exercise shows its sets, targets (per-set when they differ), alternatives, notes and demo link. Supersets are grouped. Program notes and resources are shown; archived programs show a notice (decision 0020).
- Data comes only from the new invoker RPCs over existing RLS. Drafts are never fetched.
- Verification: `pnpm verify` (217 unit tests, typecheck, build), 14 pgTAP assertions and 4 HTTP tests. Migration 00014 was applied to the running local DB without a reset. The HTTP test added a "Training view block" program (with a draft rename) to Maya; `pnpm db:reset` removes it. No browser checks.

## Mesocycle logging, muscle totals and editor details (2026-11-17)

- **Spreadsheet Program details:** the List View Program details fields (Style/Title, Theme, Program notes) now also sit at the top of Spreadsheet view. They are one shared component with the same autosave and undo.
- **Muscles (decision 0021):**
  - Exercises carry up to 8 muscle groups (migration 00015).
  - Mesocycle grids have a Muscles column after RIR goal; List View has a Muscles field under Exercise details.
  - Both autocomplete from muscles already used in that week (ArrowUp/Down and Enter, or click). A typed name takes the week's existing spelling.
  - Demo mesocycles in the seed now list muscles.
- **Set logging (FR-07):**
  - Migration 00016 adds `training_sessions` and `logged_sets`, written only through security-definer functions open to the client and staff with access.
  - Clients log weight/unit/reps per set from the Training day view (mesocycles), adding sets up to the coach's maximum. Rows save on blur, retries are idempotent, and failures stay on screen with Retry.
  - Workout date, notes and complete/reopen are on the session.
  - A logged day keeps the revision it started under.
  - Coaches open the same view from the editor's **Client log** link (`/coach/clients/:id/programs/:id/log`). Their edits are attributed.
- **Set totals:** per-day sets per muscle (logged/planned), a total, and the change since the last earlier day that trained each muscle. "—" means there is no comparison; missing data is never 0.
- **Clients table:** Last edited shows date and time and counts service changes. It is now the default sort, newest first. Columns have pixel default widths (Name 160, Email 210, Services 180, Status 128, Added 128, Last edited 192), each with a minimum. Drag a header edge to resize (arrow keys on the focused handle, double-click to reset); widths are remembered in this browser. Services tags wrap onto more lines when the column is narrow; every other cell stays on one line and overflow ends in "…" with the full value on hover.
- **Copyright and use notice:** a footer on every page (`© 2026 Modern Physique Systems`) links to a public `/use-notice` page. The full notice also appears under every client program. The owner approved the wording on 2026-11-17, and it lives in `src/lib/legal.ts`.
- **Client exercise boxes** have a light surface fill.
- **Stimulus & Fatigue Tracking:** built (decision 0021). Owner answers are recorded there. The coach's per-week muscle table is still to do.
- **Verification:**
  - `pnpm verify`: all unit tests, typecheck and build pass.
  - `pnpm test:db`: all 250 assertions pass, including 8 muscle and 30 session checks.
  - The session tests caught and fixed a null access-check bug (decision 0021).
  - Migrations 00015–00016 and the regenerated seed are applied to the running local DB without a reset; the local demo programs need `pnpm db:reset` to pick up seeded muscles.
  - No browser checks and no new HTTP tests for logging (the pgTAP suite covers retries, limits and access).

## Client activity, Reviews and clients-page overview (2026-11-17)

- **Recent updates (decision 0023):** the client page shows the 5 latest sessions above Programs; "View full history" opens `/coach/clients/:id/activity` (grouped by day, "Load more"). Items open the logged day and return to where the coach came from.
- **Reviews (decision 0024):** the sidebar's Reviews page lists client activity across all visible clients with per-staff read state (opening an item marks it seen; "Mark all as read"), an All/Unread filter (`?filter=unread`) and an unread badge (count when collapsed, dot on the phone menu button), polled every minute. Markers fade out on read. Coach corrections never notify.
- **Clients page (decisions 0025–0026):** "To review" (unread count, latest 3 in a compact form) and "Upcoming today" (next 3 of today's PT sessions) sit above Services / Status / Follow up. Upcoming sessions use labelled sample data in local development only; booking is a recorded PRD scope addition. Services and Status stay side by side on phones.
- **Fixes:** the Grid no longer scrolls to its first cell when an editor opens (only an explicit `item`/`focus` in the URL moves focus); the coach's client-log notice is a grey note with an info icon; clients-table cells are top-aligned when services wrap.
- **Verification:**
  - `pnpm verify`: typecheck, 247 unit tests and build pass.
  - pgTAP run per file for the affected suites: `011` (30), `012` (18), `013_client_activity` (15) and `014_staff_activity_reviews` (26) pass. The full `pnpm test:db` was not rerun.
  - The production bundle was checked to contain none of the sample sessions.
  - No browser checks; the owner is checking the UI manually.

## PT scheduling, phase 1 (2026-11-17)

- **Decision 0037** specifies personal training scheduling, a recorded scope addition (PRD §3 excludes booking and billing; billing stays excluded).
- **Migration 00030:**
  - Patterns repeat every 1–4 weeks with per-day local times in the coach's time zone.
  - One row per session, generated 84 days ahead and topped up hourly by pg_cron.
  - "This session only" and "this and following" edits, one-off sessions, and cancel/reinstate.
  - Client cancel/reschedule requests. A cancellation is late inside the coach's window (24 hours by default) when sent. A reschedule is free if accepted before the session starts and expires otherwise.
  - Billing groundwork: attended and no-show sessions are frozen.
- **Profile settings:** everyone has a Time zone card. A client's zone saves to the client record, and the card offers the device's zone when it differs. Staff also set a meeting link and the late cancellation window.
- **Verification:**
  - `023_pt_scheduling.test.sql`: 80 pgTAP assertions. They cover access for clients, coaches, unassigned coaches, anonymous users and disabled clients, recurrence including daylight saving and 2- and 4-week cycles, idempotent generation, both edit scopes, requests, expiry, frozen sessions, primary-coach changes and paused services.
  - Full `pnpm test:db` passes.
  - `pnpm verify` passes. The time zone list moved to `src/lib/timeZones.ts`.
  - The migration was applied to the running local DB without a reset. No browser checks.

## PT scheduling, phase 2, and other requests (2026-11-17)

- **Coach scheduling screens (decision 0037):**
  - A Sessions card on the client page: patterns, the next 31 days, setup notices, and cancelling remaining sessions after a pause or end.
  - A repeating-pattern editor with a server preview.
  - A session dialog: change or cancel one session, reinstate, answer client requests, or change the pattern from this date.
  - Client requests in Reviews.
  - Migration 00031: `get_pt_scheduling`, `get_pt_appointment`, `stop_pt_scheduling`, request activity and read state. Sessions with request history survive pattern changes.
- **Deleting archived services (decision 0038):**
  - Admins can show archived services on the client page and delete them after confirming (migration 00032).
  - Services with programs, nutrition programs or PT patterns are refused, with a message naming what is linked.
- **Nutrition correction history:**
  - Uses the shared animated chevron instead of the native triangle.
  - Coach/Client correction appears as a badge, and Before/After sit in their own nested box.
- **Verification:**
  - `pnpm verify`: 295 unit tests, typecheck and build.
  - Full `pnpm test:db` passes, including the new `024` (25) and `025` (9) suites.
  - Migrations 00031–00032 were applied to the running local DB without a reset.
  - No browser checks.
  - The client side of requests (sending them) arrives with phase 3, so requests can only be created through the API for now.

## Meetings, current programs and Upcoming today (2026-11-17)

- **Meetings (decision 0039):**
  - PT sessions are now meetings tagged with one or more services. Only Personal training meetings are billable or can be cancelled late.
  - Each tagged service can name a program to discuss, defaulting to the current one. Staff-only notes, and a remembered "Hide cancelled" toggle.
  - Migration 00033 renames everything from `pt_*` to meetings.
- **Current programs:**
  - The coach chooses a current program per service. With only one program, it is current automatically.
  - The Services card shows it as a one-line link with ↗; the Programs card has "Make current".
  - Clients see "Current" on their Training and Nutrition lists.
- **Upcoming today** lists real meetings, and the sample sessions are deleted.
- **Client page:** section icons on Recent updates, Meetings, Programs and Services.
- **Verification:**
  - `pnpm verify` (299 unit tests) and the full `pnpm test:db` (including 31 new meeting assertions) pass.
  - `supabase db diff` replayed all migrations into a shadow database with no drift.
  - Migration 00033 was applied to the running local DB without a reset. No browser checks.

## Meetings page (2026-11-17)

- Repeating patterns have their own staff-only notes, shown on each of their meetings (migration 00035, 38 assertions in `026`).
- Meetings in the sidebar (decision 0040): the next meeting countdown, the next three, and a month/week/day calendar with "Hide cancelled". Clicking a meeting opens it on the client page.
- `pnpm verify`: 306 unit tests (7 new calendar tests), typecheck and build. No browser checks.
- **Delete archived service with its programs** (decision 0038, revised): an admin-only option that deletes published programs and their logged workouts after typing the service name. Migration 00034 adds a delete-only, transaction-local exception to published-revision immutability. The full `pnpm test:db` passes.

## Known limitations

- **Programs:** program/revision tables, both coach editors, the client Training view and mesocycle session logging are implemented. Programs under an ended (but not archived) service still appear to the client (decision 0020, open question). Nutrition now has its own draft/publish/archive lifecycle, weekly spreadsheets, shared daily records, correction history and program-relative summaries (decision 0029). Import-batch and general audit tables remain pending; Client Home has saved-record nutrition tasks, while training task derivation remains pending.
- **Activity feeds:** Training updates derive from latest record state, so a coach overwriting a client's only logged row can drop that workout from Reviews; general `audit_events` is still pending. Nutrition notifications use durable client/day activity, survive coach corrections and retain the separate before/after entry history (decision 0030). Feeds and unread counts poll every minute (no realtime).
- **Meetings:** coach screens and Upcoming today are built (decisions 0037, 0039). Clients can ask to reschedule or cancel any upcoming meeting, from Home or their Meetings page, picking from the coach's open times (decision 0050). The PT dashboard lists the client's next 4 weeks of PT sessions and their history (decision 0052). The client calendar and the UTC time zone prompt are still to do. Nothing emails Matt, and Google Calendar sync is in the backlog.
- **Invitations:** invite and recovery emails have only been verified against local Mailpit. Real Resend delivery is untested.
- **Playwright:** not yet a project dependency. The browser smoke script lives outside the repo.
- **No linting:** no ESLint or formatter is configured yet.
- **Bundle size:** ~921 kB unsplit; Vite reports the existing large-chunk warning.
- **Roles:** staff roles are assigned by SQL. There is no role-management UI (by design for the MVP).
- **Activation:** `mark_client_active` runs when the client first loads the app after sign-in, not inside Auth itself.
- **Email changes:** changing a client's email after binding does not update their auth email. A server-side flow will be needed.
- **Importer:** see the gaps listed in the spike report.

## What's needed from Matt and the owner

1. Anonymized altered-layout files for each family (`docs/fixtures.md`).
2. The chat/design mockups, if they should guide the M3 editors.
3. Decisions: the meaning of `qs` and `(1)`, whether "X or" rows are alternatives, whether `20, 18` are per-set targets, the default weight unit, and the PRD §15 items (calculation rules, retention, region).
4. Authorization and accounts for hosted Supabase/Cloudflare and Resend SMTP. None of these were created.

## Next milestone

Work since M3 has followed owner priorities across M4–M6 rather than the roadmap order, so there is no single next milestone yet. The next planning session should pick one, ideally after running `/milestone-check` against M4–M6 to see what's left for their exit criteria.

- **First:** the owner's manual UI checks for decisions 0043–0052 (checklists in each decision and in `docs/todo.md`).
- **Open candidates:**
  - Playwright as a dev dependency, with the smoke script promoted to `tests/e2e`; ESLint and a formatter.
  - The `audit_events` table for publish and access changes, which also gives Recent updates and Activity before/after history.
- **Done in M3:** program tables, `save_draft` and `publish_revision`, the draft command model, both editors and the client Training view (decisions 0004–0008, 0020).

## Backlog (owner requests, not scheduled)

- **Calendar view and sidebar navigation:** implement a calendar view in a later increment and add a new **Calendar** option to the sidebar.
- **Upcoming today — "starts soon" cue** (decision 0026): on the clients page, under a session's time (e.g. "7:00 AM"), show small red text "in X minutes" when it starts in 30 minutes or less. Needs a timer so it updates while the page is open (and disappears once the session starts), plus a unit test for the 30-minute boundary. Use the danger token, not a hard-coded red.
- **Google Calendar sync for meetings** (decision 0039): when Matt creates, moves, cancels or reinstates a meeting (recurring or one-off), add or update it in his Google Calendar. Needs:
  - Google OAuth for the coach, with tokens kept server-side and never in `VITE_*`.
  - An Edge Function or job that pushes changes, storing the Google event id on each meeting so updates and cancellations hit the same event.
  - Retry and error handling, so a Google outage never blocks scheduling.
  - A decision on one-way sync (app → Google) versus also reading Google busy times.
  - Explicit authorization before any hosted Google project or credentials are created.

## Profile settings and pictures (2026-11-17)

- Clients and coaches can save preferred name, optional birthday and phone number, see their sign-in email, and upload/change/remove a private profile picture (decision 0027). Missing/broken pictures use a silhouette.
- Settings opens from the client header or coach sidebar, including collapsed sidebar and mobile drawer. Local migration 00022 is applied; client pages and notification photos remain the next increment.
- Typecheck, 251 unit tests, build, 22 profile database assertions and two Storage API flows passed. The full database run found two existing enrollment seed mismatches; no reset or browser automation.
- Manual check: in each role, open settings from the avatar, save/clear personal details and reload, upload/replace/remove a picture, and check desktop/mobile navigation in both themes.
- Verification preference reaffirmed: minimize automated testing and use user-run local/manual UI checks where practical.

## Shared banner motion (2026-11-17)

- Alerts now share entrance and exit transitions, retaining the last visible content while folding away. Transient banners use a visibility prop so clearing request state can animate their removal. Reduced-motion preferences are respected.
- Profile feedback is dismissible and uses the same behavior as program, client, activity, and authentication feedback. Typecheck passed; manual verification: save/dismiss profile feedback, save again during its exit, and check a form error appearing and clearing. No browser automation or test suite run for this change.

## Client detail profile picture (2026-11-17)

- The coach-facing client header shows a circular profile picture to the left of the name and email, with the shared missing/broken-photo placeholder. Signed picture URLs refresh while the page remains active.
- Local migration 00023 allows assigned coaches and administrators to read a client's currently referenced photo. Other users and unreferenced files remain protected; photo writes remain owner-only.
- Manual check: open a client with a picture and one without, then check the header on a narrow screen.

## Nutritional Programming (2026-11-17)

- FR-09/FR-10, decision 0028: coach target assignment, separate dated weight/calorie entries, recent/older history, attributed coach corrections, coverage-aware weight averages and calorie balances are implemented. Nutrition uses its own data model rather than workout drafts.
- Client Home derives nutrition tasks from saved records; Progress displays the same nutrition summaries. New targets preserve earlier goal periods. Daily edits have version conflict protection and idempotent retries.
- Local migration 00024 is applied without a database reset. Typecheck, 258 unit tests, production build, 45 nutrition database assertions and 4 nutrition HTTP checks passed. The existing bundle-size warning remains. No browser automation or screenshot analysis.
- Manual UI checklist and boundaries (imports, prediction formula, nutrition in Reviews) are in decision 0028.

## Notification profile pictures (2026-11-17)

- Reviews, the clients-page latest unread notifications, client Recent updates and full activity history now show the client's profile picture instead of a service icon. Shared client/photo queries reuse cached results across rows and refresh signed URLs; missing or broken pictures use the existing silhouette.
- Typecheck passed. Manual check: view Reviews and To review with clients who have photos and clients without photos, then check Recent updates on a client page. No browser automation or screenshots.

## Nutritional program lifecycle and Spreadsheet (2026-11-17)

- Owner-approved changes in decision 0029: multiple nutritional programs, Program Style titles, Start Date, four weeks by default, coach baseline fields and an automatic starting prediction. Nutrition now uses the same Programs rows, lifecycle badges, filters and removal menu as training. Creation buttons use New Mesocycle Program / New Nutritional Program.
- Coach and client Spreadsheet views show weekly dated tables with editable weight and previous-day calorie fields. Connected Weekly Caloric Values / Weekly Weight Values sit beside each sheet on wide screens and stack below on smaller screens. Calculated cells are read-only; daily edits save on blur and bounded rectangular paste saves atomically.
- Rolling averages appear after three weigh-ins. Weekly changes compare weekly averages; Week 1 compares its average against its first weigh-in. Mesocycle totals use available weeks, and average weekly change divides by weeks with sufficient data. Coverage and estimated predictions are explicit.
- Publishing preserves immutable baseline revisions; overlapping dates warn without blocking, and actuals are shared by client/date. Existing targets were copied into published program baselines without moving or duplicating actuals. Correction attribution/history, stale-edit checks, retries, and unsaved-navigation warnings are retained.
- Local migration 00025 is applied without a database reset. Verification: typecheck, 267 unit tests, build, 106 nutrition database assertions and 5 HTTP checks pass. Existing bundle-size warning remains. No browser automation or screenshots; manual checklist is in decision 0029.

## Daily nutrition first, with coach notifications (2026-11-17)

- Client Nutrition now opens the current program with today's weight and yesterday's calories consumed/output at the top. A single atomic save updates the shared daily records, with saved circle-and-tick indicators and green completion feedback. Stats and editable spreadsheets remain below. Home completion requires all three saved values.
- Nutrition saves appear in Reviews, To review, unread counts, Recent updates and activity history with client photos. There is one stable notification per client/day; meaningful client corrections revive unread state, while retries, identical saves and coach corrections do not. Notifications open the matching spreadsheet day and preserve the return destination.
- Local migration 00026 is applied without a reset. Verification: typecheck, 269 unit tests, build, 78 targeted database assertions and 6 HTTP checks pass. Existing bundle-size warning remains. No commands were skipped awaiting approval. Browser/UI verification remains manual; see decision 0030.

## Nutrition grid parity and weekly summary layout (2026-11-17)

- Decision 0031: nutrition and mesocycle grids share the exact scroll-gradient component and pointer drag-selection hook. Nutrition adds rectangular selection/copy/cut, protected clears, keyboard navigation/editing, paste review, per-week Undo/Redo and a cell context menu. Date and computed cells remain read-only.
- Weekly calorie/weight summaries now fill a connected panel matching the main spreadsheet frame's height on wide screens, with icons in both headings. The explanation beneath the spreadsheets is more transparent.
- Local migration 00027 enables versioned null weights for safe clearing/restoring, retaining audit, retry and isolation guarantees. Missing weights do not become zero or count toward averages/completion. Client clears update their existing daily notification.
- Verification: typecheck, 274 unit tests, build, 120 targeted database assertions and 6 nutrition HTTP checks. No browser automation/screenshots; manual checklist is in decision 0031. Existing bundle-size warning remains. No commands were skipped awaiting approval.

## Nutrition draft autosave (2026-11-17)

- Decision 0032: removed the manual Save draft step. Nutrition program details autosave one second after editing, matching mesocycle and personal training. All editors share the existing save-status indicator.
- Typing stays enabled during a save; older save responses preserve newer edits and the next save uses the advanced lock version. Errors keep edits and expose retry/reload actions. Publish remains explicit and waits for autosave; clients continue seeing the last published revision until then.
- Typecheck, existing unit suite and production build checked. No database changes or browser automation; manual interaction checklist is in decision 0032.

## Coach nutrition entry editing and attribution (2026-11-17)

- Decision 0033: fixed the working-draft restriction that blocked coach daily-entry editing. Assigned staff can edit today's/past input cells directly in the main program sheet; corrections save immediately to the shared client/date records, independently of publishing program details.
- Coach and client sheets show a subtle gold tint, corner marker and Edited by coach tooltip on affected cells. Calorie intake/output attribution is field-specific and survives changes to the companion cell; client changes clear only the changed field's marker.
- Local migration 00028 is applied without a reset. Verification: typecheck, 275 unit tests, build, 149 targeted database assertions and 6 HTTP checks. The notification fixture now isolates itself from existing overlapping development programs within its rolled-back transaction. No browser automation/screenshots; manual checklist is in decision 0033. Existing bundle-size warning remains. No commands skipped awaiting approval.

## Plain program status labels (2026-11-17)

- Removed user-facing revision numbers and terminology across personal training, mesocycle and nutrition: Programs pills show Live, editor status uses Live / Draft, and publish, removal and conflict copy describes programs and preserved history in plain language. Internal revision storage and locking are unchanged.
- Typecheck checked; manually confirm program pills, editor headings and publish feedback. No browser automation or screenshots.

- Nutrition program weight units (FR-09/10, decision 0034): added autosaved lb/kg selection under coach Program details. Daily entry, spreadsheet inputs, averages and predictions use the selected unit; existing measurements convert without rewriting history. Migration 29 applied locally. Typecheck, 278 unit tests, build and 99 targeted database assertions passed; manual UI checks pending.

- Nutrition trends (FR-09/10, decision 0035): added shared coach/client line chart below mesocycle stats, with 7/30-day ranges, weight/intake/output/balance selector, point markers, gold gradient, axes and matching cursor tooltip. Respects program units and activity dates; fewer than two points shows the requested empty message. Typecheck, 281 unit tests and build passed; manual visual checks pending.

## Commit and push verification (2026-11-17)

- Nutrition Publish is disabled when program details match the live program, including reverted edits; valid unpublished details enable publication. Daily actual edits remain independently saved.
- Client content width is now 1,120px, with header/footer edges aligned and existing mobile padding/profile form width retained.
- Owner clarified that future nutrition dates remain read-only; confirmed past-day and empty-cell editing works. Browser inspection was explicitly authorized for that investigation.
- Final checks: typecheck, 282 unit tests and production build passed. Full local database suite passes all 540 assertions after isolating legacy training activity fixtures from nutrition data, selecting a single enrollment deterministically, and comparing exact authorized enrollment IDs instead of seed-dependent counts. Fixture cleanup runs inside rolled-back transactions and does not reset development data.
- Eight profile/nutrition HTTP boundary checks also passed. Existing Vite bundle-size warning remains. No commands skipped awaiting approval.

## 2026-11-20 planning session work

Open items are tracked in `docs/todo.md`.

- Answered requests leave "To review" (decision 0043): accepted, declined and expired meeting requests, and service requests once the service is added, no longer count as unread. They stay in Reviews history. Migration 00040 is applied locally. 12 new pgTAP assertions; full suite passes (776). Manual UI check pending.
- Required fields: the Program details fields that block publishing now show an asterisk, with `aria-required` and a "* Required to publish" note. They are Program Style (mesocycle), Title (personal training), and Program Style, Start Date, Weeks and both starting calorie fields (nutrition). There is no HTML `required`, so drafts still autosave. Typecheck, 318 unit tests and build pass. Manual check pending.
- Mesocycle progress: the Home training progress bar is now a shared `TrainingProgressBar`. It also shows under the program notes on the client's mesocycle program page. Same checks; manual check pending.
- Service request answers (decision 0044): any staff member with access can accept (adds the service) or reject (optional reply) a request, from the client page's Services section or the Clients page's new Service requests panel. Both share one query. Clients see recent declines on Home and can edit the note on a pending request, which brings it back as unread. Migrations 00041–00043 are applied locally. 27 new pgTAP assertions; full suite passes (794); 319 unit tests and build pass. Manual check pending.
- Archived programs (decision 0045): a ⋯ menu with Restore (into a live service, same permission as archiving) and, for admins, Delete permanently (published revisions and logged workouts included, via 0038's purge flag). Migration 00044 is applied locally; 19 new pgTAP assertions pass. Also: coach pages widened (1280px default, 1536px for Clients, Meetings and the program editor), Services listed newest first, Reviews renamed Activity in the UI (route unchanged), larger Meetings step chevrons. Manual check pending.
- Activity trends (decision 0046): the Activity page is split in half, with the feed beside sticky trend charts (notifications received per hour/day, by type, by client) for today, the last 7 days or the last 30 days. Migration 00045 is applied locally; 12 new pgTAP assertions pass. Activity notifications also gained a nested details card. Manual check pending.
- PT sessions, coach view (decision 0047): attendance (Completed / No-show once a meeting starts; audited corrections, including back to "not recorded"), "Shared with client" notes kept apart from private notes, meeting resources (files in a private 50 MB bucket, or links), an Upcoming / Past switch on the Meetings card with a full past-meetings page, and "Record attendance" to-dos on the Meetings page. Ending a pattern now also keeps meetings with shared notes, resources or attendance. Migration 00046 is applied locally; 51 new pgTAP assertions, full suite passes (885); 331 unit tests and build pass. Manual check pending. Backlog: cascading deletes leave stored resource files behind. Also: the Activity trend tooltip now follows the cursor.
- Record attendance (decision 0048): the Meetings page pairs To-dos (meeting requests, now a vertical list) with a Record attendance section. Ended meetings without attendance are listed by day, newest first, with one-click No-Show / Mark Completed, Undo, focus moving to the next row, and an all-or-nothing "Mark all completed". The calendar preview also offers No-Show / Mark Completed. Correction reasons are now optional. Migration 00047 is applied locally; 9 new pgTAP assertions, full suite passes (894); 335 unit tests and build pass. Manual check pending.
- Coach availability and client meeting requests (decision 0050):
  - Coaches set weekly working hours and booking rules (notice, look-ahead, gap) in Profile settings.
  - Coaches add time off or extra hours on the Meetings page. Unavailable time is striped in the calendar's week and day views, and month view marks time-off days.
  - Clients reschedule or cancel their next meeting from Home. They pick from open times the server computes, or send a message when none work. A picked time is held from other clients while it waits.
  - Short-notice requests warn the client and are flagged for the coach, never refused.
  - Migration 00049 is applied locally, and `supabase/seed/availability.sql` is loaded into the running DB (it is in `config.toml` for future resets). 40 new pgTAP assertions; the full suite passes (943). 356 unit tests and the build pass. No browser checks; manual check pending.
  - Phase C (2026-11-21): a client list of all upcoming meetings with the same dialog.
- Client navigation per service (decision 0051):
  - Home · Mesocycle · Personal training · Nutrition · Progress, each section with its own guard.
  - `/mesocycle` and `/personal-training` replace `/training`; old links redirect to the program's own section and keep the week and day.
  - The phone tab bar says "PT", with the full name for screen readers.
  - 356 unit tests and build pass. Manual check pending.
- Personal training dashboard (decision 0052):
  - `/personal-training` has Your program on top, then Next session beside Upcoming (4 weeks), Progress (completed, this month, weekly streak, attendance rate, 12-week chart) and History, whose rows open shared notes and resources.
  - Stats are pure functions in `src/domain/scheduling/ptStats.ts` (11 unit tests). `ColumnTrend` moved into `src/components/`.
  - No migration. 2 new pgTAP assertions check that clients list only their own past meetings. 367 unit tests and build pass. Manual check pending.
- Follow-ups:
  - The coach's client log view shows the mesocycle progress bar, using the client's time zone.
  - The Clients page keeps the green tick for "All caught up." and "No upcoming meetings." (owner preference); only Follow up uses the grey inbox.
  - The coach's service request dialog has roomier spacing.
  - `list_pending_service_requests` no longer returns `unread` (migration 00050, applied locally). Activity keeps the read state.
  - Typecheck, 367 unit tests and build pass. Manual check pending.
- **Local DB needs a reset:** `023`, `026` and `030` fail against the running local DB because of state left by manual testing (for example a third active nutrition enrollment). The other 35 files pass, including `032` and `035`. Run `pnpm db:reset` before the next full `pnpm test:db`.
- Billing, phase A (decision 0053, a recorded scope addition: PRD §3 excludes billing):
  - Migration 00051 is applied locally. It adds default and per-client prices, session charges created from attendance, monthly Mesocycle/Nutrition charges with the automatic bundle discount, payments with partial allocation and credit, voids, adjustments, an audit log and the coach e-transfer email.
  - 73 new pgTAP assertions (`039_billing.test.sql`). The full suite passes apart from the 3 known `023` failures. `supabase db diff` shows no drift.
  - `src/domain/billing/` has 10 unit tests; `pnpm verify` passes (377).
  - No UI yet. Next: phase B (coach screens), then C (client screens).
- Billing, phase B (decision 0053): coach screens.
  - A Billing sidebar page (overview, clients by balance, sessions needing a price, admin default prices).
  - The same billing panel on the client page: pricing, monthly statements, payments, mark paid, edit, void, charges and credits.
  - Solo/Partner and price in the meeting and pattern dialogs, and the e-transfer email in Profile settings.
  - Migration 00052 (pattern format in `schedule_document`) is applied locally. 74 pgTAP assertions in `039`, and 3 new HTTP tests in `tests/policies/billing.test.ts`. `pnpm verify` passes.
  - The monthly charge job was run once by hand locally, so the seeded clients have November charges.
  - Manual UI check pending. Next: phase C (client Home card, `/billing`, Pay dialog).

## Public repository and agent handoff (2026-11-20)

- The README was rewritten for a public portfolio, with an ownership and IP notice for Modern Physique Systems. The logo and business name link to the MPS website.
- `samples/` (the three MPS templates) is gitignored and was removed from the whole Git history with `git filter-repo`, then force-pushed. Copies stay on the owner's machine only. `tests/imports/samples.test.ts` skips when the files are absent, and `pnpm spike:import` explains how to pass files instead.
- Agent instructions moved to `AGENTS.md` for Codex; `CLAUDE.md` imports it. The next steps are listed in priority order at the top of `docs/todo.md`.
- Typecheck and importer tests pass with and without the samples (34, or 21 plus 3 skipped).

## Coach search and sidebar clients list (2026-11-21)

Decision 0054 (owner request; not covered by the PRD). Manual UI checks pending.

- **Search.** A command palette opened with ⌘K or Ctrl+K (the label follows the platform), from a Search button above Clients, from the drawer, or from the top bar below `lg`. It finds clients (all statuses) and mesocycle, PT and nutrition programs by name, both limited by RLS, plus pages and sections. Opening it lists suggested pages and sections; clients and programs appear only once you type. Matching is fuzzy and the synonyms come from a central dictionary in `src/domain/search/`. Results are grouped, with icons and highlights, and work by keyboard.
- **Sections.** Links with `#id` now scroll to and outline their section once it renders (`src/app/useHashTarget.ts`). Five new heading ids on Profile settings and Clients.
- **Sidebar.** A chevron beside Clients lists active clients: 5 at first, then Show more / Show less. It's hidden when the sidebar is collapsed.
- **Verification.** `pnpm verify` passes (397 unit tests, 20 in `tests/domain/search.test.ts`). The programs query was checked against the local stack as Matt. No browser checks.
- **Manual checks for the owner:**
  - [ ] ⌘K (Mac) or Ctrl+K (Windows) opens and closes search. The button shows the right shortcut.
  - [ ] "Gra" shows Grace Liu with a person icon. "Calendar" shows Calendar first with a calendar icon. "calender", "invites", "vacation" and "change my time zone" each find the right item.
  - [ ] Opening search lists the suggested pages and sections but no programs. Typing a program name (e.g. "Hypertrophy", "Deficit") shows it under Programs with the client's name, and opens it.
  - [ ] ↑/↓ wrap, Enter opens, Escape closes, hovering moves the highlight. Long result lists scroll with the highlight.
  - [ ] Sections (Time zone, Availability, Calendar, Time off, Client invitations) scroll into view below the top bar with a brief gold outline, in light and dark themes.
  - [ ] Reschedule requests or Service requests with nothing waiting open the page at the top, with no error.
  - [ ] Collapsed sidebar: a search icon only, no chevron. Drawer (narrow window): the search field, and the chevron works.
  - [ ] Chevron: smooth open and close, the line lines up under the Clients icon, Show more / Show less, the open client's name highlighted, clicking a name opens that client.

## Upcoming today opens meetings in place (2026-11-21)

- Clicking a meeting under Clients > Upcoming today now opens the meeting dialog over the Clients page (`MeetingDialogHost`, as on the Meetings page) instead of navigating to the client's page with `?session=`. Saves close the dialog and show the usual toast (with Undo for attendance).
- **Verification.** `pnpm verify` passes (397 unit tests). No browser checks.
- **Manual checks for the owner:**
  - [ ] Clicking an Upcoming today row opens the meeting dialog and the page stays on Clients.
  - [ ] Closing the dialog leaves you on Clients. Saving a change shows the toast, and the row updates.
  - [ ] "Change the repeating pattern" opens the pattern editor in the same place.

## Programming charges list their services (2026-11-21)

- A monthly programming charge now always shows its service lines under it (e.g. "Mesocycle programming $200"), even when there's only one. Before, the breakdown appeared only with two or more lines, so a single-service client saw just "November 2026 programming". With one line, Edit moves from the ⋯ menu to the line's own Edit link. Session and adjustment charges are unchanged.
- **Verification.** `pnpm verify` passes (397 unit tests). No browser checks.
- **Manual checks for the owner:**
  - [ ] Daniel Okafor's November statement shows the service name and $200 under "November 2026 programming", with an Edit link that opens the price editor.
  - [ ] A client with both services still shows both lines and the bundle discount.
  - [ ] PT session charges still show as a single row with Edit in the ⋯ menu.

## Seeded PT sessions are billed; request badges name their kind (2026-11-21)

- **Seed billing.** Past demo sessions were inserted already attended, but session charges come from the status-change trigger, so none were billed. `supabase/seed/meetings.sql` now bills them through `private.create_session_charge` (12 charges after `pnpm db:reset`). Recording attendance in the app was always fine.
- **Request badges.** Meeting rows on the Meetings page and Clients > Upcoming today show "Cancellation request" (red) or "Reschedule request" (gold) instead of "Request" (`RequestBadge`).
- **Verification.** `pnpm verify` (397), `pnpm test:db` and `pnpm test:api` (26) pass after a reset. No browser checks.
- **Manual checks for the owner:**
  - [ ] Daniel's October and November statements list each attended session as "Personal training · 60 min" at $100.
  - [ ] Grace's Nov 25 meeting shows a gold "Reschedule request". A pending cancellation shows a red "Cancellation request".

## Mark a charge unpaid (2026-11-21)

- A charge with money on it (paid or part paid) has **Mark unpaid** in its ⋯ menu. It voids the payment(s) applied to that charge through the existing `void_payment`, so the audit keeps the reason (prefilled "Marked paid by mistake"). If one of those payments also paid other charges (e.g. "Mark November paid"), the dialog names them, since they become unpaid too. No migration. Monthly totals on statements are also bigger (`text-base font-semibold`).
- **Verification.** `pnpm verify` passes (397 unit tests). No browser checks.
- **Manual checks for the owner:**
  - [ ] Mark one PT session paid, then Mark unpaid: it goes back to Unpaid, the payment shows as void under Payments, and the balance goes back up.
  - [ ] Mark a whole month paid, then Mark unpaid on one charge: the dialog warns that the month's other charges are unpaid too.
  - [ ] Unpaid charges don't show Mark unpaid.
- **Follow-up.** Under Payments, a payment's ⋯ menu says **Mark unpaid** instead of Void (same `void_payment`; reason prefilled; a voided payment reads "Marked unpaid: reason"). Credits keep **Void**, since there's nothing to un-pay.
  - [ ] A payment's ⋯ shows Mark unpaid. Confirming makes its charges owed again and the row reads "Marked unpaid: …". A credit still shows Void.

## Overdue badges (2026-11-21)

- Billing > Clients: the red badge under a client's balance now reads just **Overdue** (was "$X overdue").
- Statements: a past month with anything left to pay shows a red **Overdue** badge instead of Unpaid or Part paid (`isOverdue` in `src/domain/billing/billing.ts`). The current month keeps Unpaid / Part paid. Charge badges inside the month are unchanged.
- **Verification.** `pnpm verify` passes (398 unit tests, one new). No browser checks.
- **Manual checks for the owner:**
  - [ ] Billing > Clients: a client with an unpaid earlier month shows "Overdue" with no amount.
  - [ ] Daniel's October statement shows "Overdue"; November still shows "Unpaid". Mark October paid and it shows "Paid".

## Settled months move to a statements page; no ring around the page (2026-11-21)

- **Statements.** The billing panel lists this month and past months with something left to pay. A past month that becomes fully paid collapses out with the disclosure animation (rows stay mounted, clipped only while moving so ⋯ menus aren't cut off; instant with reduced motion). When any month is hidden, **See statements for previous months** links to `/coach/clients/:id/billing` (`BillingHistoryPage`), the same panel with every month. A page rather than a modal, so charge dialogs don't stack on a dialog, and it matches the meetings history page. `statementShown` in `src/domain/billing/billing.ts`, with a test.
- **Focus ring.** `#main-content` no longer shows the gold focus outline when the skip link or a route change focuses it (`src/index.css`). Controls keep theirs.
- **Verification.** `pnpm verify` passes (399 unit tests). No browser checks.
- **Manual checks for the owner:**
  - [ ] Mark Daniel's October paid: it slides out, and "See statements for previous months" appears.
  - [ ] That link opens All statements with every month, and its ⋯ menus (Mark unpaid, etc.) work. Mark October unpaid there, go back, and it's listed again.
  - [ ] An open month's ⋯ menu isn't clipped on the client page or the Billing page.
  - [ ] Using the skip link or changing pages no longer draws a gold border around the page content. Tabbing to buttons and links still shows the ring.

## Restore a payment marked unpaid; All statements header (2026-11-21)

- **Restore.** A payment marked unpaid now has a ⋯ menu with **Mark paid** (**Restore** for a credit). Migration `20261121000053_restore_payment.sql` adds `restore_payment(id)`: staff with access only, idempotent, clears the void and re-applies the payment to the oldest open charges (its old allocations were deleted when it was voided, so if the coach recorded another payment in between, it may land on different charges or become credit). Audited as `payment_restored`. pgTAP: `040_restore_payment.test.sql` (8).
- **All statements** header shows the client's photo and a larger name.
- **Verification.** `pnpm verify` (399) and `pnpm test:db` pass. No browser checks.
- **Manual checks for the owner:**
  - [ ] Mark a payment unpaid, then ⋯ → Mark paid: it loses the strike-through and its charges are paid again.
  - [ ] All statements shows the client's photo (or initials) and the name larger under the title.

## Recent payments (2026-11-21)

- The billing panel's Payments list shows the 5 most recent. With more, **See all payments** opens the client's All statements page at Payments (`#payments`, scrolled and outlined by `useHashTarget`). There the list also starts at 5, with **Show all payments** to expand it.
- **Verification.** `pnpm verify` passes (399). No browser checks.
- **Manual checks for the owner:**
  - [ ] A client with more than 5 payments shows 5 and "See all payments" on the client page and Billing page. Clients with 5 or fewer show no link.
  - [ ] The link opens All statements scrolled to Payments with a brief outline, and "Show all payments" lists the rest.

## Client billing and "I've sent it" (2026-11-21)

Decision 0055 (0053 phase C plus the phase D notice). The Activity item is still to do (see `docs/todo.md`).

- **Home.** Owing: "You owe $X", "Includes $Y from October" (or "from September onward") when an earlier month is unpaid, **View billing** and **Pay**. Otherwise a quiet "Billing: Paid up" or "$X in credit" line. Hidden for clients with no billing yet. A pending notice adds "You told your coach you sent $X on …".
- **`/billing`** (from Home and a new Billing card on Profile settings): balance with Pay, this month with its charges, past months in disclosures (Overdue / Unpaid / Part paid / Paid badges, each charge's status in words), Your prices (monthly services, bundle discount when both, PT rates that have a price), and payments.
- **Pay dialog.** Amount, the primary coach's e-Transfer email with Copy, and the 0053 instructions. No email: "<coach> hasn't set up e-Transfer yet." **I've sent it** asks for amount (prefilled with the balance), date and an optional message, then tells the coach. It never changes the balance.
- **Coach.** Billing page: **Payments clients reported (N)** above Sessions that need a price. **Record payment** opens the payment dialog prefilled and confirms the notice in the same call (`record_reported_payment`). **Dismiss** asks for a staff-only reason.
- **Database.** Migration `20261121000054_billing_payment_notices.sql`: one pending notice per client (a new report updates it), idempotent ids, RLS (clients read their own, staff the clients they can access), no column grant on the dismiss reason, audit events.
- **Verification.** `pnpm verify` (406 unit tests; 7 new in `tests/domain/billingClient.test.ts`), `pnpm test:db` (new `041_billing_payment_notices.test.sql`, 24) and `pnpm test:api` (27; a new test keeps staff billing calls and notice reasons from clients) pass after `pnpm db:reset`. `clientTraining.test.ts` "published title and week count" failed once right after the reset, then passed three times. It's flaky and unrelated to billing. No browser checks.
- **Manual checks for the owner:**
  - [ ] Sign in as Daniel (client): Home shows "You owe $…" with Includes … from October, View billing and Pay.
  - [ ] /billing: balance, This month with the Nutrition line and sessions, October under Past months marked Overdue, Your prices (Nutrition $200/mo, Session · 60 min $100 …), Payments. Statuses read in words as well as colour.
  - [ ] Pay: amount, Priya's e-Transfer email (or the "hasn't set up e-Transfer" text if she has none; set one under the coach's Profile → Payments), Copy email works.
  - [ ] I've sent it → Let my coach know → thanks screen. Home and /billing show "You told your coach you sent …". The balance is unchanged.
  - [ ] As the coach, Billing shows "Payments clients reported (1)". Record payment is prefilled with the amount and date; saving lowers Daniel's balance and removes the notice. Dismiss needs a reason and removes it too.
  - [ ] Profile settings (client) has a Billing card linking to /billing. A client with no charges sees no billing line on Home.
  - [ ] Phone width (320px): the Home card, /billing rows and the Pay dialog don't overflow.

## Client billing follow-ups: shared statements, "I've paid this", Activity (2026-11-21)

Decision 0055, "Owner follow-ups".

- **Home.** A "Billing" heading with the billing icon above the "You owe …" card.
- **/billing statements** now use the coach's statement rows: months as disclosures with total and badge, charges with service lines, "$X left to pay". No staff actions. An unpaid charge's ⋯ has **I've paid this** (amount prefilled with what's left, editable for partial payments), and a month has **I've paid <month>**. A charge with a pending report shows "You said you paid $X on … · waiting for your coach".
- **Notices** can name charges, so a client can have several pending (one per set of charges; the same set again updates it). Recording one pays those charges first. The coach's list and dialog say what it's for.
- **Settling.** When the coach records payments some other way (Mark paid, Mark month paid, Record payment, credits), notices settle: once their charges are paid, or once the balance is 0. They leave "Payments clients reported".
- **Activity / Clients > To review.** New `payment_notice` items: "Says they paid $300", gold **Payment** badge, then Recorded / Dismissed / Paid when handled. Unread while pending. In Focused, the unread badge and trends. Opening one goes to Billing with the client selected and marks it read.
- **Database.** Migration 00054 rewritten (uncommitted, never deployed): `charge_ids`, `settled`, `reported_at`, `staff_payment_notice_seen`, `apply_credit` now settles notices. New migration 00055 for the Activity feed. pgTAP `041` (34) covers reporting, isolation, Activity read state, confirming onto named charges, settling and dismissing.
- **Verification.** `pnpm verify` (408 unit tests; 2 new feed tests), `pnpm test:db` and `pnpm test:api` (27) pass after `pnpm db:reset`. No browser checks.
- **Manual checks for the owner:**
  - [ ] Home (Daniel): "Billing" heading with icon above "You owe …".
  - [ ] /billing: statements look like the coach's. ⋯ on an unpaid charge shows only "I've paid this". The month button says "I've paid November 2026". No Edit links.
  - [ ] Report $50 for one session: the charge shows "You said you paid $50 …". Reporting the same session again says it replaces the earlier one.
  - [ ] As Matt/Priya: Activity and Clients > To review show "Says they paid $50" with a Payment badge and an unread dot. Opening it goes to Billing with Daniel selected. Focused includes it.
  - [ ] Payments clients reported says "for Personal training · 60 min". Record payment pays that session first.
  - [ ] Report the whole balance from Pay → I've sent it, then as the coach Mark each month paid until the balance is 0. Daniel disappears from Payments clients reported, and Activity shows the item as Paid.

## Billing page keeps the open client (2026-11-21)

- With no client chosen, the Billing page opens the top client on the Owing list. That client now stays open (and listed) after they stop owing, e.g. once the coach marks the last month paid, instead of switching to the next client. Changing the filter chip picks the top of the new list again. Home's billing section also got a "Billing" heading, the green "Paid up" tick (shared `AllClear` in `src/components/`), a larger amount and a divider.
- **Verification.** `pnpm verify` passes (408). No browser checks.
- **Manual checks for the owner:**
  - [ ] Billing (no client in the URL): mark every month of the first client paid. Their panel stays open showing Paid up, and they stay in the list until you change the filter or reload.
  - [ ] Choosing another client or a filter chip still works as before.

## Profile settings: Save only when something changed (2026-11-21)

- Every Save button on Profile settings is disabled until its section differs from what's saved: Save profile (name, date of birth, phone), Save time zone, Save session settings, Save e-transfer email, and Save availability (working hours and booking rules). Clients see the first two. Comparisons ignore surrounding spaces. `ComboboxField` gained an optional `onValueChange`.
- **Verification.** `pnpm verify` passes. No browser checks.
- **Manual checks for the owner:**
  - [ ] Coach with an e-transfer email set: Save e-transfer email is greyed out on load, enables when you edit it, and greys out again if you type it back or after saving.
  - [ ] Same for Save profile, Save time zone (pick a different zone), Save session settings and Save availability (tick a day, change a time or a rule).
  - [ ] As a client: Save profile and Save time zone behave the same.
  - [ ] "Use it" (device time zone) still saves directly.

## Demo seed: more requests and payment history (2026-11-21)

- New `supabase/seed/activity.sql`, loaded last (after availability, because a reschedule's picked time has to be an open slot). Everything goes through the app's own functions, acting as the client or coach, and is then backdated:
  - **Service requests:** Daniel asks for Mesocycle, Maya asks for Personal Training. Grace's existing Nutrition request is unchanged.
  - **Meeting requests:** Daniel asks to reschedule his PT in 8 days (with the first open slot 1–4 days later, if there is one). Maya asks to cancel her check-in in 6 days. Grace asks to cancel her PT in 11 days. Grace's existing reschedule is unchanged.
  - **Payments:** Daniel's and Grace's past-month sessions are paid. Daniel reported his and Matt confirmed it. Grace reported hers and Priya marked the month paid, so it shows as Paid (settled). Grace also paid this month's first sessions in cash a week ago.
  - **Payment notices:** Maya's first report ($30, a typo) was dismissed. Her corrected report for the full balance is waiting for review, and so is Daniel's for this month's sessions. Both show unread in Activity and under Payments clients reported.
- The feed tests (014, 019 and 028) now clear payment notices along with the other request types before they run. 028 also clears Daniel's seeded request and counts payment notices as Focused items, which they have been since migration 00055.
- **Verification.** After `pnpm db:reset`, `pnpm test:db`, `pnpm test:api` (27) and `pnpm verify` all pass. No browser checks.

## Meetings To-dos as a card strip (2026-11-21)

- Meetings > To-dos now uses the same sideways card strip as Clients > Service requests (`ScrollStripList`, ‹ › buttons, fixed-width cards), replacing the vertical list with "Show all". It still pairs with Record attendance on large screens. Recorded in decision 0048.
- **Verification.** `pnpm verify` passes. No browser checks.
- **Manual checks for the owner:**
  - [ ] Meetings with the demo seed (4 pending requests): To-dos shows a row of separate cards that scrolls sideways. The ‹ › buttons appear when the cards overflow and move by most of a view.
  - [ ] A card opens the meeting dialog in place, as before.
  - [ ] With meetings waiting in Record attendance, To-dos takes the left half and its strip scrolls within that half. With none, the strip spans the full width.
  - [ ] Narrow screen: cards are at most 85% of the width, and the page doesn't scroll sideways.

## Demo seed: meetings waiting for attendance (2026-11-21)

- `supabase/seed/meetings.sql` leaves the last week's PT sessions for Daniel and Grace unrecorded (still `scheduled`), and adds a 15-minute one-off call with Maya four days ago, also unrecorded. With a fresh reset, Meetings > Record attendance lists all three. Unrecorded sessions aren't billed, so Daniel's and Grace's November totals are one session lower.
- **Verification.** After `pnpm db:reset`, `pnpm test:db`, `pnpm test:api` (27) and `pnpm verify` pass. One full `test:api` run had a single failure in `billing.test.ts`, which passed on its own and on the next full run. No browser checks.

## Skeleton loading (2026-11-21)

- Decision 0056. Every page and section that loads data now shows a skeleton in its own shape, not a spinner. Spinners stay only for actions: busy buttons, saving, and quick checks inside dialogs. Skeletons appear after 150 ms and fade in; faster loads show nothing. App start-up shows the logo bar and placeholder cards instead of a full-screen spinner.
- New `src/components/Skeleton.tsx` (`LoadingRegion`, `Skeleton`, `SkeletonText`, `SkeletonHeader`, `SkeletonRows`, `SkeletonCard`, `SkeletonTable`) and `src/features/scheduling/MeetingSkeletons.tsx`. `Skeleton` moved out of `ui.tsx`.
- `tests/lib/loadingStates.test.ts` fails on any loading spinner outside the allowed list.
- **Verification.** `pnpm verify` passes (409 tests). No browser checks; the manual checklist is in decision 0056.

## Help pages for coaches (2026-11-21)

- Decision 0057. A new **Help** link with a question-mark icon sits above Profile settings in the coach sidebar and drawer. `/coach/help` lists eight topics: Getting started, Profile settings, Clients, Activity, Training programs, Nutrition, Meetings and Billing.
- Pages are MDX (`@mdx-js/rollup` 3.1.1, `remark-gfm` 4.0.1, `@types/mdx` 2.0.14) in `src/features/help/content/`, and each loads as its own chunk. `<Example>` renders real components with fictional data on a gold gradient with grain. `<Callout>` is for tips and notes.
- Help search finds sections by heading and text and opens the page at that heading (`src/domain/help/sections.ts`, reusing the coach search matcher). ⌘K lists the Help pages.
- `Highlighted` moved from the command palette to `src/components/Highlighted.tsx` so both searches share it.
- `tests/domain/help.test.ts`: manifest and files match, no dashes, unique section ids, section extraction and ranking.
- **Verification.** `pnpm verify` passes (420 tests). The dev server serves both compiled pages and `?raw` text. No browser checks; the manual checklist is in decision 0057.

## Help: separate Mesocycle and Personal training pages (2026-11-21)

- Owner request, recorded in decision 0057. Training programs is replaced by **Mesocycle** and **Personal training**, so Programs in Help lists those two pages and Nutrition. Mesocycle covers Program Style and Theme, the RIR goal and Muscles columns, client set logging, set totals, Stimulus & Fatigue, and the coach's Client log. Personal training covers the Title, how sessions follow the current program, and the client's attendance figures.
- The editor sections both pages share are in `src/features/help/content/shared/program-editor.mdx`. `inlineShared` (`src/domain/help/sections.ts`) puts that text into both pages for search and the topic list.
- The Clients help page's statuses table shows the status pills instead of plain words.
- Phase 2 plan in decision 0057 updated to 13 pages.
- **Verification.** `pnpm verify` passes (423 tests). The dev server passes components through to the shared editor. No browser checks.

## Help polish (2026-11-21)

- Help index: topic cards with browser-window thumbnails of the matching app page (rebuilt from components, light and dark), the topic list beside the index too, an Overview link at its top, lighter group labels, and wider gaps between groups. The topic list scrolls on its own with a fade while there's more below.
- `Kbd` now has a fill instead of a border, and more vertical padding, everywhere it's used.
- **Verification.** `pnpm verify` passes (423 tests). No browser checks; manual checks are in decision 0057.

## Help phase 2, step 1: animated demos (2026-11-21)

- Decision 0057. A demo player and three looping Spreadsheet demos, placed in the shared editor text on the Mesocycle and Personal training pages: per-set targets (`10 / 8 / 6`), dragging a row (with renumbering), and Shift-select, Delete, then Undo.
- The scripts run the editor's own planners on a fictional program, so each frame matches the real Spreadsheet. The player plays only while on screen and the tab is visible. It has Pause and Play, and opens paused on the last frame with reduced motion. Screen readers get a description and the list of steps.
- **Verification.** `pnpm verify` passes (429 tests, including `tests/domain/helpDemos.test.ts`). No browser checks; manual checks are in decision 0057.

## Help phase 2, step 2: editor detail, paste and publish demos (2026-11-21)

- Decision 0057. The shared editor text on the Mesocycle and Personal training pages now covers:
  - publishing rules and readiness;
  - Spreadsheet keys;
  - weeks, days, Focus and sections;
  - every exercise column, with alternatives, demo links, annotations and supersets;
  - rearranging, with the cell and week menus;
  - copying and pasting;
  - current, archived and deleted programs.
- Two new demos: the paste review (`planPaste`) and Publish readiness (`validateForPublish`), with fixing two issues and publishing.
- **Verification.** `pnpm verify` passes (430 tests). No browser checks.

## Help: nutrition demos (2026-11-21)

- Decision 0057. Two demos on the Nutrition page, drawn through the app's own nutrition maths:
  - A week filling in, one morning's log at a time, with the "Calories for …" note.
  - Missing entries, a coach correction (planned with `planNutritionCells`), and Correction history.
- The page now explains that a log fills one row: that morning's weight and the previous day's calories. It also explains the calculated columns. This corrects the earlier plan's wording.
- **Verification.** `pnpm verify` passes (433 tests). No browser checks.

## Help phase 2, steps 3 and 4: new pages and meeting, availability and billing demos (2026-11-21)

- Decision 0057. Three new pages, each with a thumbnail:
  - **Roles and permissions** (Start here): coach and administrator, which clients each sees, the primary coach, transferring a client, and one table of who can do what. Checked against the admin checks in the database and the app.
  - **What clients see** (Start here): signing in, the tabs for each service, Home, programs (Workout and Spreadsheet), logging, meeting requests, paying, and what clients never see.
  - **Availability and open times** (Meetings and billing): working hours, booking rules, time off and extra hours, how open times are worked out, held times, and short notice.
- **Meetings** rewritten with step-by-step guides: one meeting, repeating meetings, changing a pattern from a date or for one meeting, pattern notes, ending and paused patterns, the Meetings card and page, requests, and attendance. Two corrections to the old text: a meeting's attendance is a **Status** dropdown, not two buttons, and a pattern is ended with **End** (the dialog's button is Stop repeating).
- **Billing** rewritten: an itemized monthly charge with the bundle discount and mid-month services, step-by-step guides to set a missing price, record a payment, record or dismiss a client's notice, Mark unpaid, void and edit, and how to read a statement.
- Four demos:
  - Record attendance with Undo (`src/domain/help/meetingDemos.ts`), grouped and focused with the page's own `groupAttendanceByDay` and `nextFocus`, and its notice text from `attendanceMessage`.
  - A repeating pattern filling Next meetings, with the dialog's day-copy rule and the pattern's `describePattern` summary.
  - A payment paying the oldest charges first and leaving credit (`billingDemos.ts`), drawn through `statements`, `isOverdue` and `balanceText`.
  - How open times are worked out (`availabilityDemos.ts`), one lane at a time.
- Allocation and open times are worked out only in SQL. The billing and availability demo files each hold a small copy of that rule (`applyCredit`, `dayWindows`, `dayOpenTimes`), with a comment saying to change both together. Tests check the demos against these copies.
- **Verification.** `pnpm verify` passes (444 tests). No browser checks; manual checks are in decision 0057.

## Help phase 2, step 5: remaining pages and an accuracy pass (2026-11-21)

- Decision 0057. Clients, Activity, Nutrition, Profile settings and Getting started now have step-by-step guides, each checked against the code:
  - Clients: onboarding, follow-ups, filters, the row menu, service changes, archiving and deleting, service requests and notes.
  - Activity: filters, where items open, read state, labels and Trends.
  - Nutrition: starting values, the spreadsheet, corrections, Trends and the weight unit.
  - Profile settings: a first-time setup list.
  - Getting started: a First steps list.
- "See … in Help" references on every page are now links.
- Accuracy fixes: the client row menu is a right-click menu. The starting weight change is worked out, not typed. Correction history includes client corrections. Coaches now see **Missing** highlights too (owner choice). They were shown only to clients before; the flag is removed, and the Nutrition page, its correction demo and a test match.
- **Verification.** `pnpm verify` passes (444 tests). No browser checks; manual checks are in decision 0057.

## Scheduling phase C: the client's meetings list (2026-11-21)

- Decision 0050. A client `/meetings` page lists every meeting in the next 60 days, across services, grouped by day in the client's profile zone. Home's meeting heading links to it as **All meetings**.
- Each meeting has Join call and the same Reschedule, Cancel meeting, pending request and Withdraw as Home. The controls moved to `src/features/scheduling/MeetingRequestControls.tsx`, shared by both. Cancelled meetings stay listed, crossed out.
- `upcomingByZonedDay` in `src/domain/scheduling/upcoming.ts` groups by the profile zone's calendar dates, with unit tests (including a daylight saving change).
- No server changes. The Help page What clients see is updated.
- **Verification.** `pnpm verify` passes (446 tests). No browser checks; manual checks are in decision 0050.

## Client meetings cards and client menu (2026-11-21)

- Client Meetings (decision 0050): each meeting is a full-width row behind a gold rule, with the time and actions on one line and a details box below (coach, topic, length, repeats, programs as boxed links with their service icons, and the waiting request with Withdraw).
- Client menu (decision 0058): Meetings and Billing are always in the menu. Two or more services share one Services item: a dropdown in the top bar, a panel above the phone tab bar.
- On phones the Services tab opens a `/services` page: each service with its programs, the current one first and marked Current (decision 0058).
- **Verification.** `pnpm verify` passes (446 tests). No browser checks; manual checks are in decisions 0050 and 0058.

## Help search results above page content (2026-11-24)

- Owner meeting, item 5. On wide screens the Help search results were drawn behind the page's text and thumbnails. The page's entrance animation gives it its own layer, painted after the sticky sidebar. The sidebar is now `z-10` and the search box `z-20`.
- The other owner requests from the 2026-11-24 meeting are listed in `docs/todo.md`.
- **Verification.** `pnpm verify` passes. No browser checks.

## Delete row, rename in place, PT week names (2026-11-24)

- Decision 0059 (owner meeting, items 1 and 2).
  - The Spreadsheet's cell menu has **Delete row** for one exercise, undoable.
  - A faint pencil renames the program title in place at the top of the editor (`EditableText`).
  - Personal training weeks can be named, in the Spreadsheet and in List View's week settings. Blank or "Week N" labels still show the number. Mesocycle weeks stay numbered.
- Help pages updated: the shared editor text, Personal training (new Week names section) and Mesocycle.
- **Verification.** `pnpm verify` passes (449 tests). No browser checks; manual checks are in decision 0059.

## Clients see archived programs (2026-11-24)

- Decision 0060 (owner meeting, item 4). New `list_archived_programs()` (migration 00056) with grants and pgTAP tests. An **Archived programs** disclosure on the Mesocycle page and the PT dashboard, closed by default.
- Help: What clients see and the shared editor text mention it.
- The local DB was reset. `pnpm test:db` passes (1067), so the earlier `023`, `026` and `030` failures were leftover state.
- **Verification.** `pnpm verify` (449), `pnpm test:db` (1067) and `pnpm test:api` (27) pass. No browser checks; manual checks are in decision 0060.

## Duplicate a program (2026-11-24)

- Decision 0061 (owner meeting, item 3). **Duplicate** in the editor and **Duplicate…** in the client page's program menu. For a published program the dialog offers **Archive this one, use the copy** or **Keep both**.
- `copyProgramDraft` copies with fresh ids. `duplicate_program` (migration 00057) creates, saves and optionally archives and switches current in one transaction, with grants and pgTAP tests.
- The editor is now keyed by program id, so opening the copy starts a fresh editor.
- Help: a new "Duplicating a program for the next session" guide on Personal training, and the shared editor text.
- Open: day notes (needs the owner's answer, see the decision).
- **Verification.** `pnpm verify` (452), `pnpm test:db` and `pnpm test:api` pass. No browser checks; manual checks are in decision 0061.
