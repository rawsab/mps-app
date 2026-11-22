# 0058 — Client menu: Meetings, Billing and a Services menu

Date: 2026-11-21 · Status: accepted (owner request) · Built

- **Change.** Updates decision 0051. The client menu is now Home · services · Progress · Meetings · Billing.
  - **Meetings** (`/meetings`, decision 0050 phase C) and **Billing** (`/billing`, decision 0055) are always shown. Both apply to every client, whatever their services. Before this, only links on Home led to them.
  - **Services.** With one service, its tab is shown on its own, as before. With two or more, they share one **Services** item. In the top bar it opens a dropdown under the word, with each service's icon and name. On phones the Services tab opens a **Services page** (`/services`) instead (owner request).
- **Services page.** One section per service, in the order Mesocycle, Personal training, Nutrition, each headed by the service's full name with an **Open** button (a secondary `ButtonLink`) to its own page (the PT dashboard, today's nutrition log). Under each heading are its programs in the rows the service pages use: published training programs, and nutritional programs including archived ones, as on the Nutrition page. The current program comes first with its **Current** badge. A service with no programs says so. The page works at any width, though only the phone tab links to it. The tab stays current inside any service.
- **Why the threshold is two.** Progress is shown with any service, so a client with two services would otherwise have six phone tabs. Grouping from two keeps the phone tab bar at five tabs at most and fits next to the logo at `sm`. It also keeps a single-service client one click from their service.
- **Behaviour.** The Services item is a disclosure of links (a button with `aria-expanded`), not an ARIA menu, so it reads as navigation. It shows as current, with the gold underline or gold tab, while any of its sections is open, including a program inside one. It closes on navigation, Escape (focus returns to the button), a click outside, or focus leaving it. With a mouse, the top bar's dropdown also opens on hover and closes 200 ms after the pointer leaves, so moving down to the list doesn't close it. A click right after a hover keeps it open. Touch and the phone tab bar open on tap only.
- **Not changed.** Routes, guards and `clientSections`. Progress stays its own item, since it spans services. Coach navigation is unchanged.
- **Manual checks.**
  - As a client with one service: Home, the service, Progress, Meetings and Billing show as separate items.
  - As a client with two or three services: Services opens the list; the current service is gold; the item stays underlined on a program page; Escape and clicking outside close it.
  - On a phone (320px wide): five tabs fit. Services opens the Services page, with each service, its programs, and Current on the current one. The tab stays gold on a service or program page.
  - Mouse: hovering Services opens the list, moving onto it keeps it open, and moving away closes it.
  - Keyboard: Tab to Services, Enter opens it, Tab moves through the links, Escape closes it.
