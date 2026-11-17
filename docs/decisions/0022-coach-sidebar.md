# 0022 — Coach sidebar navigation

Date: 2026-11-17 · Status: accepted

- **Coaches get a sidebar; clients keep the bottom tab bar.** PRD §6 fixes what each navigation contains, not its layout. Matt's navigation will grow (client workspaces, account/settings) and he mostly works at a desk in wide tables and editors, so from `lg` up the coach workspace uses a left sidebar holding the logo, Clients/Templates/Reviews, the theme toggle and sign out. Clients have at most four sections and log mostly on a phone, so `ClientLayout` is unchanged.
- **Collapsible, remembered per browser.** The sidebar collapses to icons (labels stay as accessible names and hover titles) to give editors more width. The choice is stored in `localStorage` under `mps.coachSidebar.collapsed`; if storage is unavailable it lasts for the visit.
- **Resizable with a minimum.** Expanded, the sidebar's right edge drags between 192px and 360px (arrow keys step 16px, double-click resets to 224px), matching the clients-table column handles. The width is remembered under `mps.coachSidebar.width`. Collapsing ignores it and returning restores it.
- **Drawer below `lg`.** A top bar with a menu button opens the same links in a native `<dialog>` drawer (focus trap, Escape, focus return). Choosing a link or widening past `lg` closes it.
- **Not done yet:** editor routes do not auto-collapse the sidebar, and coach pages keep the `max-w-5xl` content width. Revisit both once Matt has used the program grid with the sidebar.
