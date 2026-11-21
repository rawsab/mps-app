# 0051 — Client navigation per service

Date: 2026-11-20 · Status: accepted (2026-11-20 planning session, plan item 3) · Navigation built; PT dashboard pending

- **Sections.** Client navigation is Home · Mesocycle · Personal training · Nutrition · Progress. Each training service gets its own section instead of a shared "Training" one. `clientSections` returns `mesocycle`, `personalTraining`, `nutrition` and `progress`, and the route guards check the section for each route. Progress is shown when any service is active, as before.
- **Routes.**
  - `/mesocycle` lists mesocycle programs only, and `/mesocycle/:programId` opens one.
  - `/personal-training/:programId` reuses `TrainingProgramView`.
  - `/personal-training` lists PT programs for now. The PT dashboard replaces that list next.
  - `clientProgramPath(service, id?)` in `src/lib/services.ts` builds these paths. Home's service links, the next-workout to-do and the next meeting's program links all use it.
- **Wrong section.** A program opened under the other training section redirects to its own section and keeps `?week=&day=`.
- **Old links.** `/training` redirects to Mesocycle, or to Personal training if the client has no mesocycle. `/training/:programId` looks up the program's service and redirects to the matching section. Guards still apply after the redirect.
- **Labels.** The phone tab bar shows "PT", with "Personal training" kept for screen readers; with up to five tabs it still fits at 320px. The top bar uses the same short label below the `lg` breakpoint, because five full labels don't fit next to the logo at `sm`. Mesocycle gets a new cycle icon; Personal training keeps the dumbbell.
- **Not changed.** Coach routes and activity links already point at `/coach/...` paths. Nothing outside `src/` linked to `/training`.
