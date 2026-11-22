# 0058 — Client menu: Meetings, Billing and a Services menu

Date: 2026-11-21 · Status: accepted (owner request) · Built

- **Change.** Updates decision 0051. The client menu is now Home · services · Progress · Meetings · Billing.
  - **Meetings** (`/meetings`, decision 0050 phase C) and **Billing** (`/billing`, decision 0055) are always shown. Both apply to every client, whatever their services. Before this, only links on Home led to them.
  - **Services.** With one service, its tab is shown on its own, as before. With two or more, they share one **Services** item. In the top bar it opens a dropdown under the word; on phones, a panel above the tab bar. Each entry has the service's icon and name.
- **Why the threshold is two.** Progress is shown with any service, so a client with two services would otherwise have six phone tabs. Grouping from two keeps the phone tab bar at five tabs at most and fits next to the logo at `sm`. It also keeps a single-service client one click from their service.
- **Behaviour.** The Services item is a disclosure of links (a button with `aria-expanded`), not an ARIA menu, so it reads as navigation. It shows as current, with the gold underline or gold tab, while any of its sections is open, including a program inside one. It closes on navigation, Escape (focus returns to the button), a click outside, or focus leaving it. With a mouse, the top bar's dropdown also opens on hover and closes 200 ms after the pointer leaves, so moving down to the list doesn't close it. A click right after a hover keeps it open. Touch and the phone tab bar open on tap only.
- **Not changed.** Routes, guards and `clientSections`. Progress stays its own item, since it spans services. Coach navigation is unchanged.
- **Manual checks.**
  - As a client with one service: Home, the service, Progress, Meetings and Billing show as separate items.
  - As a client with two or three services: Services opens the list; the current service is gold; the item stays underlined on a program page; Escape and clicking outside close it.
  - On a phone (320px wide): five tabs fit, and the Services panel opens above the bar without going off screen.
  - Mouse: hovering Services opens the list, moving onto it keeps it open, and moving away closes it.
  - Keyboard: Tab to Services, Enter opens it, Tab moves through the links, Escape closes it.
