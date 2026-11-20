# 0049 — Shared UI components

Date: 2026-11-20 · Status: implemented (owner request), manual UI verification pending

- **Goal (owner request):** refinements made in one place should live in a shared component, so every screen gets them and new pages need no visual adjustment. The aim was no visual change, with one exception: the sections tooltip used an undefined `shadow-card` and now has `shadow-lg`, like the chart tooltips.
- **Tokens (`src/index.css` `@theme`):** `shadow-focus` (gold ring on text controls), `shadow-popover` (dropdown panels), `rounded-inner` (5px, options inside a bordered group).
- **Components:**
  - `ui.tsx`: `controlClass`, `FieldShell` and `fieldDescription` (all fields; SelectField gains hint and error), `Badge` `size` plus `raised` / `gold-soft` tones, `Card` `padding` and `as`, `SectionHeading`.
  - `controls.tsx`: `IconButton`, `SegmentedControl`, `Chip`, `ToggleButton`, `Tabs`, `Checkbox`.
  - `Dialog.tsx`: `ConfirmDialog`, `DialogBody`.
  - `ActionsMenu.tsx`: `ActionItem`.
  - `PopupMenu.tsx`: moved from `features/programs/GridPopupMenu`.
  - `Tooltip.tsx`: `InfoTip`, `ChartTooltip`.
  - `icons.tsx`: `CloseIcon`, `InfoIcon`, `MoreIcon`.
  - `AnimatedDisclosure`: `heading`, `size`, `meta`.
- **ActionsMenu vs PopupMenu:** both are kept. ActionsMenu is a touch-sized list of buttons that drops below a ⋯ trigger. PopupMenu is a dense context menu at a point, with arrow keys.
- **Training view tabs** now use the same tablist semantics and arrow keys as the program editor. They look the same.
- **Not consolidated:**
  - The spreadsheet cell editors (dense by design).
  - Calendar chips and the sidebar drawer.
  - The tables, which share too little.
  - The `<dl>` lists: only two of six share a layout.
  - A single inline Remove/Keep confirmation.
  - The Alert dismiss button, which inherits its tone colour.
  - RecordAttendance's and ScrollStrip's icon buttons, which use their own hover and border.
- **Found, not changed:** Tailwind orders `min-h-11` and `px-4` after the smaller sizes, so Button overrides such as `className="min-h-10"`, `"px-3"` or `"px-2"` never applied. Those buttons render full size. Only `text-xs` and `!` overrides take effect. A real Button `size` prop would make those buttons visibly smaller, so it waits for an owner decision.
- **Open owner decisions (phase 6, visible changes):**
  - Focus ring and ink fill for every input (AddGridStructureDialog, the add-exercise box, the workout date, the paste box, the clients filter, the mobile program select).
  - One menu and popover shadow.
  - One segmented-control height.
  - `.link` for the four solid-underline inline actions.
  - Standard hover on the attendance buttons.
  - Button sizes.
- **Verification:** `pnpm verify` passed after each phase (335 unit tests). There's no component test setup. Unchanged rendering was checked by comparing class strings. No browser checks.
