# 0057 — Help pages for coaches

Date: 2026-11-21 · Status: **built 2026-11-21** (owner request; manual UI checks pending) · Builds on 0049, 0054, 0056

Coaches had no in-app explanation of the workspace. **Help** is a new coach section with one page per area, written in plain language.

## Decisions

- **Name and place.** "Help" (owner choice over "Documentation": shorter, and it matches the question-mark icon). The sidebar link sits directly above Profile settings, apart from the main items, in the sidebar, collapsed sidebar and phone drawer. Routes: `/coach/help` (topics) and `/coach/help/:slug`.
- **Coaches only** for now (owner choice). Client help can reuse the same setup.
- **Pages are MDX** (`@mdx-js/rollup` + `remark-gfm` for tables). Markdown elements are mapped to app styles in `src/features/help/mdxComponents.tsx`, using theme tokens only. Help loads as its own route chunk, and each page is a further chunk.
- **Live components, not screenshots** (owner choice). `<Example>` shows real components with fictional props on a gold gradient with grain (`.help-example` in `index.css`, built from tokens, so it follows light and dark mode). Examples are `inert` unless marked `interactive`, so a click never navigates or saves. Only presentational components go in examples: nothing that runs a query.
- **`<Callout>`** is its own static component, styled like `Alert`. `Alert` is a live region for messages that appear, which doesn't fit page content.
- **Help search** (owner request). Every `##` and `###` heading is a section, searched by title and by the words under it. The index comes from the page source (`?raw` imports, which the MDX plugin skips), through `extractSections` in `src/domain/help/sections.ts`. Ranking reuses the coach search matcher (decision 0054): title matches first, body words as search terms. A result opens the page at the heading (`useHashTarget`). Heading ids come from one `headingId` function on both sides.
- **⌘K** lists Help and each Help page (group "Help"). Sections stay inside Help search, so the palette isn't flooded.
- **Topic cards** (owner request) on `/coach/help`, two columns from `sm`. Each thumbnail is the black and gold frame (`.help-thumb`) with a small browser window showing part of the matching app page. The window sits in from the top and left and runs off the right and bottom (owner choices). The pages are rebuilt from real components with fictional data in `src/features/help/thumbnails.tsx`, not screenshots, so they don't go stale. Both the window and the frame follow the theme (owner request): in light mode the window is a light page and the frame rises from cream into gold (`--color-help-thumb`). `Card` gained `padding="none"` for it. Thumbnails are hidden from screen readers and inert.
- **Topic list with headings** (owner request). In the article page's topic list, each page has a chevron that shows or hides its headings, on a continuous line, with `###` headings indented. The open page's list expands on its own and collapses when you move to another page, unless you opened it with the chevron. Closing the open page's list by hand lasts until you next arrive at that page. They reset on reload. The list comes from the same section index as search (`src/features/help/sectionIndex.ts`).
- **A stationary frame** (owner request). Help is one layout route (`HelpLayout`) with the index and pages as children. The topic list and search sit beside the index too (owner request), with no page's headings open. The list starts with **Overview**, which opens the main Help page (owner request; "Overview" chosen over Home, which the client app already uses for its own page). Its route `handle` is `sectionRoute('help')`, which keys `RouteContent` by section instead of by path, so the topic list and search stay mounted between pages. Only the page beside them settles in (`page-enter`, keyed by slug), and a new page starts at the top unless the link names a heading.
- **Mesocycle and Personal training are separate pages** (owner request, built 2026-11-21). They are different services: clients log sets for Mesocycle but not for Personal training. Programs in Help holds exactly three pages: Mesocycle, Personal training and Nutrition. Both training services use the same editor, so its instructions are written once in `content/shared/program-editor.mdx` and included in both pages (`<ProgramEditor components={props.components} />`). Shared files aren't pages. `inlineShared` puts their text in place before sections are extracted, so the shared headings appear in each page's search results and topic list.
- Numbered steps use Markdown ordered lists. A separate `<Steps>` block wasn't needed.

## Writing rules

Simple, minimal language. Short sentences. No litotes ("not bad"), no irony, no em or en dashes. Name buttons and fields exactly as the app shows them, in bold. Say who can do something when it's admin-only. Fictional names and amounts only. `tests/domain/help.test.ts` fails on a dash.

## Adding or changing a page

1. Add `{ slug, title, summary, group }` to `HELP_PAGES` in `src/domain/help/pages.ts`.
2. Add `src/features/help/content/<slug>.mdx`. Import `Example` and `Callout` from `../blocks`.
3. Keep headings plain text and unique within the page.
4. When a feature's behaviour or labels change, update its Help page in the same change.

The test checks that the manifest and files match and that section ids are unique.

## Manual checks for the owner

- [ ] Sidebar: Help with the question-mark icon sits right above Profile settings. Check expanded, collapsed (tooltip) and the phone drawer. It highlights while a Help page is open.
- [ ] `/coach/help` lists the topics in four groups, two cards per row from small screens up. Each card's thumbnail shows a dark browser window with part of its app page, inset from the top and left and cut off at the right and bottom, with gradient showing around it. In light mode both the window and the gradient are light. Each card opens its page.
- [ ] A page: topics and search on the left on wide screens, a link back and search above the page on narrow ones. Previous and Next work.
- [ ] Examples: gold gradient with grain behind the component, in light and dark mode. Clicking inside a display-only example does nothing. The interactive ones (Reject/Accept buttons, view switch, filters, weekdays) respond to hover only and change nothing.
- [ ] Moving between Help pages from the topic list, Previous/Next or search: the topic list and search box stay still; only the page on the right fades in, starting at the top.
- [ ] Topic list (wide screens): the open page's headings show under it on a line. Open another page and the first list closes while the new one opens. Open a list with its chevron, move to another page, and it stays open. A heading link scrolls to that heading.
- [ ] Help search: type "credit", "late cancellation" or "time off". Results show the section, its page and a snippet with the match marked. Arrow keys and Enter work, Escape clears, and the page opens at that heading.
- [ ] ⌘K: "help", "docs" and "billing" show the Help pages under a Help group.
- [ ] Programs in Help lists Mesocycle, Personal training and Nutrition. Both training pages include the editor sections (Drafts and publishing through Current and archived programs) between their own sections, and their topic lists and search results show those headings.
- [ ] Read each page once for accuracy and tone.

## Phase 2 plan: detail, step-by-step guides and animated demos (owner choices, 2026-11-21)

Status: **planned, not built.** The first pages explain what each area is for but rarely how to do things.

**Pages (13).** Each page gets numbered step-by-step guides for its common jobs, with short explanations around them.

| Group | Pages |
|---|---|
| Start here | Getting started · Roles and permissions (new) · What clients see (new) · Profile settings |
| Clients | Clients · Activity |
| Programs | Mesocycle · Personal training · Nutrition (built; owner choice: only these three) |
| Meetings and billing | Meetings · Availability and open times (new) · Billing |

Keyboard shortcuts get no page of their own (owner choice). Each page lists its own.

Mesocycle and Personal training are built as separate pages (see Decisions above). The editor detail below goes into the shared editor text, so it appears on both pages. Each page keeps what belongs to its service: logging, set totals, Stimulus & Fatigue and corrections on Mesocycle; sessions and the client's attendance figures on Personal training.

**What to add, by area:**
- **Shared editor text, building:**
  - Structure: automatic week and day numbers, day Focus, Use sections per week, Every-workout prep, Program Style, Theme and notes.
  - Exercises: load modes (weight, bodyweight, assisted, added bodyweight), per side, RIR and RPE, notes, annotations, alternatives, demo links, supersets (A1/A2), and muscles (autocomplete within the week; each set counts once for every muscle listed).
  - Resources.
- **Shared editor text, spreadsheet:**
  - Editing Day and Section cells (double-click, Enter or F2) and dropdown cells.
  - Selecting with Shift-click or Shift-drag, then copying, deleting or pasting, with the paste review.
  - Dragging exercises, sections and days, including across weeks.
  - The cell menu (insert above or below, move to, duplicate, remove), the week ⋯ menu (duplicate, delete, move up or down) and the + tab menu.
  - Undo and redo.
- **Shared editor text, publishing and history:**
  - The readiness review and its issue links, conflicts and the on-device copy.
  - How the current program is chosen, and Make current.
  - Archive, Restore, and Delete (admins only, asks for the title).
  - A started workout keeps the version it started from.
- **Nutrition:** what the starting values mean, spreadsheet editing (select, copy, cut, paste, clear, undo, save and retry), missing entries, correction history, the trend chart and changing the weight unit.
- **Meetings:**
  - Pattern changes from a date ("Apply from") or for one meeting only, and pattern notes.
  - Topics, and the program a meeting follows (locked in once it starts).
  - Paused patterns, Hide cancelled, past-meeting history and calendar navigation.
- **Availability and open times:** how working hours, booked meetings, time off, extra hours, notice, look-ahead and gap combine into the times clients can pick.
- **Billing:**
  - How a monthly charge is itemized, including the bundle discount and a service added mid-month.
  - Step-by-step guides: set a price on a session that needs one, record a payment from a client's notice, dismiss a notice, void with a reason, undo Mark paid, and read a statement.
  - What the client sees.
- **Clients:** onboarding from start to finish; pause, resume, end, archive and delete a service; transfers (other coaches keep access); table filters (all of these or any of these); deleting your own notes.
- **Activity:** the Day, Week and Month ranges; the top five clients in By client; payment notices under Focused.
- **Roles and permissions:** one table of what admins and coaches can each do.
- **What clients see:** their tabs for each service, the Workout and Spreadsheet views, logging, requests and paying.

**Animated demos.** A `<Demo>` block on the black and gold backdrop plays a scripted loop, with a pointer and a caption for each step.
- **Playback** (owner choice): it plays automatically while on screen and has a Pause button (WCAG 2.2.2). It pauses when it's off screen or the tab is hidden. With reduced motion, it shows the final frame and a Play button instead. Demos can't be clicked.
- **Real components where the props are plain:** `ProgramSpreadsheet` with a fictional `ProgramDraft` that changes over time, with the selection, drag marker and pointer drawn on top. Also `Badge`, `Button`, `ToggleButton` and `ColumnTrend`. The nutrition spreadsheet depends on live data, so its demo is a copy built with the same styles.
- **Demos:**
  1. Per-set targets: typing `10 / 8 / 6`.
  2. Dragging a row, with renumbering.
  3. Shift-select, Delete, then Undo.
  4. The paste review.
  5. Publish readiness, from issues to Live.
  6. A nutrition week filling in, with missing cells and a coach correction.
  7. Record attendance with Undo.
  8. A repeating pattern filling the next meetings.
  9. A payment going to the oldest charges, leaving credit.
  10. How open times are worked out.
- **Tests:** a unit test checks each demo's steps and that it has a final frame for reduced motion.

**Order** (owner choice: the player first):
1. The `<Demo>` player and demos 1 to 3, for the owner to review.
2. The shared editor text, then more detail on the Mesocycle and Personal training pages.
3. Roles and permissions, and What clients see.
4. Meetings, Availability and Billing, with their demos.
5. The remaining pages, then an accuracy pass.

