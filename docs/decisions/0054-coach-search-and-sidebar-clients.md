# 0054 — Coach search and the sidebar clients list

Date: 2026-11-21 · Status: implemented (owner request), manual UI checks pending

- **Scope.** This was an owner request; no PRD requirement covers search or sidebar client links. Coach app only. The client app has neither.
- **Command palette, not results in the sidebar.** The sidebar is 192–360px expanded, 72px collapsed, and a drawer below `lg`. Grouped results with icons, a second line and highlighted matches don't fit there, and each state would need its own design. The palette works the same way in all three.
  - Opened from a field-like **Search** button above Clients (an icon when collapsed), from the drawer, from a search icon in the top bar below `lg`, or with **⌘K** on Apple devices and **Ctrl+K** elsewhere. The button shows the matching shortcut and sets `aria-keyshortcuts`.
  - The shortcut toggles the palette, but won't open it over another dialog (except the navigation drawer), so an unsaved form is never lost by navigating away.
  - `Dialog` gains a `bare` variant, and `ui.tsx` a `Kbd` key hint. `Dialog bare`: no title bar, anchored 12dvh from the top so it stays put as the results change height.
- **Interaction.** ARIA 1.2 combobox with a grouped listbox. ↑/↓ move and wrap, Enter opens, Escape closes, hover moves the active row. Matched letters show in gold. A live region announces the result count. An empty query lists suggested pages and sections; clients and programs only appear once the coach types. "No matches" suggests what to try. Footer key hints and the `esc` hint are hidden on touch devices, which get a close button instead.
- **Architecture.** The logic is pure and in `src/domain/search/`, tested in `tests/domain/search.test.ts`.
  - `match.ts`: a small fuzzy scorer, so no new dependency. In order: exact word, word prefix, then (titles only) mid-word and letters-in-order, then typos (1 edit for 4–5 letters, 2 for 6+, adjacent swaps count as one). Every meaningful query word has to match; filler words ("how", "my", "the") are dropped, so natural phrasings like "change my time zone" work. Accents are folded ("zoe" finds Zoë).
  - `synonyms.ts`: the central dictionary of alternative terms by concept (e.g. invitations: invites, pending clients, not accepted…). Destinations list the concepts they cover.
  - `destinations.ts`: the registry. **To add a destination**, give the target heading an `id`, add an entry, and put new shared wording in `SYNONYMS`. In development, a `#id` that never appears logs a warning.
  - `search.ts`: ranks results and groups them (Clients, Programs, Pages, Meetings, Clients page, Settings), with groups ordered by their best match, so "Gra" leads with Clients and "calendar" with Meetings. Groups are capped (6 clients, 5 otherwise).
- **Clients.** Every status is searchable (owner choice). Active clients rank first among equal matches; others show their status badge. The second line is the email, but only the part before `@` is searched, so a shared domain doesn't match everyone. Clients come from `useClients()`, so **RLS decides who appears**: coaches see their own, admins see everyone.
- **Programs.** Unarchived mesocycle, personal training and nutrition programs are searchable by name (owner request, 2026-11-21), from `useSearchablePrograms()`, so RLS limits them to the coach's clients. Titles come from `programTitle`, as on the Programs card, which uses the draft title if there is one. The service name is searchable too ("mesocycle"), but the client's name is only shown, not searched, so typing a client's name doesn't bury the client under their programs. Results open the program editor (training) or the nutrition program page. Icons match the Programs card.
- **Permissions.** Entries can require `scheduling` or `admin`. Availability, session settings, time off and extra hours require scheduling, matching what the pages show.
- **Icons.** Clients get a new single-person `UserIcon`. Meetings and Calendar use `CalendarIcon` (owner choice: calendar, not a video icon). Invitations get a new envelope `InviteIcon`. `SearchIcon` is also new. Settings use `SettingsIcon`. The rest reuse existing glyphs.
- **Sections.** `useHashTarget` (in `RouteContent`) waits up to 2.5s for a link's `#id` to render, then:
  - scrolls to it, clearing the top bar
  - focuses it, without a focus ring
  - fades a gold outline around its section
  - follows the section for 1.5s while content above loads in, unless the coach scrolls.

  A section that is folded away because it's empty (To-dos, Service requests) is inert, so the page just opens at the top. New heading ids: `profile-time-zone`, `profile-sessions`, `profile-availability`, `profile-payments`, `clients-follow-up`.
- **Sidebar clients list.** A chevron beside Clients (expanded sidebar and drawer only) reveals active clients, sorted by name, linked to their pages, and joined to Clients by a line that runs from its icon. The open client's segment of the line is gold.
  - The first 5 show, then "Show N more", then "Show less" at the bottom. Collapsing the list resets it to 5.
  - It's collapsed by default and isn't saved between visits. The sidebar and drawer share its state.
  - Clients are fetched on first expand, using the same cached query as the Clients page.
  - It uses the `.animated-disclosure-content` transition and `ChevronIcon` rotation.
- **Collapsing the sidebar** (owner-tuned). The sidebar narrows at once. The nav items (Clients to Activity) hide while it narrows, then fade and slide in, overlapping (140ms each, 10ms apart, starting at 90ms). The Search icon stays visible throughout. Reduced motion skips this. The clients list closes faster than it opens (160ms instead of 240ms).
