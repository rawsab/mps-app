# Status: first increment (M0–M2 foundation)

Date: 2026-11-16

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
- **Meetings:** coach screens and Upcoming today are built (decisions 0037, 0039). Client screens (upcoming list and calendar, sending requests, the UTC time zone prompt) are phase 3. Nothing emails Matt, and Google Calendar sync is in the backlog.
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

## Next milestone: M3 (program model, lifecycle, two editors)

1. ~~Migration step 2: templates, programs, revisions and the content hierarchy with RLS and pgTAP.~~ Done (decision 0004).
2. ~~A transactional `save_draft(expected_version, payload)` that validates against the `ProgramDraft` contract, and `publish_revision` that freezes the revision and moves the current pointer atomically.~~ Done (decision 0005).
3. ~~Draft command model (update, reorder, duplicate, insert, remove by stable id), shared by both views.~~ Done (decision 0006).
4. ~~The Program view, then the Grid view (bounded typed columns, keyboard navigation, rectangular paste preview, atomic save), with stale-draft conflict handling.~~ Done: 4a grid model, 4b editor shell + Program view, 4c Grid UI (decision 0007). Program deletion/archiving and Grid day/week removal added (decision 0008).
5. ~~Client Training view (read-only).~~ Done (decision 0020). Owner still to check it at phone width as Maya (mesocycle) and Daniel (personal training).
6. **Next:** add Playwright as a dev dependency and promote the smoke script to `tests/e2e`. Add ESLint and a formatter.
7. Start the `audit_events` table for publish and access changes. It also gives Recent updates and Reviews edit history (before/after values).

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

- Answered requests leave "To review" (decision 0043): accepted, declined and expired meeting requests, and service requests once the service is added, no longer count as unread. They stay in Reviews history. Migration 00040 is applied locally. 12 new pgTAP assertions; full suite passes (776). Manual UI check pending.
- Required fields: the Program details fields that block publishing now show an asterisk, with `aria-required` and a "* Required to publish" note. They are Program Style (mesocycle), Title (personal training), and Program Style, Start Date, Weeks and both starting calorie fields (nutrition). There is no HTML `required`, so drafts still autosave. Typecheck, 318 unit tests and build pass. Manual check pending.
- Mesocycle progress: the Home training progress bar is now a shared `TrainingProgressBar`. It also shows under the program notes on the client's mesocycle program page. Same checks; manual check pending.
- Service request answers (decision 0044): any staff member with access can accept (adds the service) or reject (optional reply) a request, from the client page's Services section or the Clients page's new Service requests panel. Both share one query. Clients see recent declines on Home and can edit the note on a pending request, which brings it back as unread. Migrations 00041–00043 are applied locally. 27 new pgTAP assertions; full suite passes (794); 319 unit tests and build pass. Manual check pending.
- Archived programs (decision 0045): a ⋯ menu with Restore (into a live service, same permission as archiving) and, for admins, Delete permanently (published revisions and logged workouts included, via 0038's purge flag). Migration 00044 is applied locally; 19 new pgTAP assertions pass. Also: coach pages widened (1280px default, 1536px for Clients, Meetings and the program editor), Services listed newest first, Reviews renamed Activity in the UI (route unchanged), larger Meetings step chevrons. Manual check pending.
- Activity trends (decision 0046): the Activity page is split in half, with the feed beside sticky trend charts (notifications received per hour/day, by type, by client) for today, the last 7 days or the last 30 days. Migration 00045 is applied locally; 12 new pgTAP assertions pass. Activity notifications also gained a nested details card. Manual check pending.
