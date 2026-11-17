# 0019 — Demo mesocycles and personal training plans in the local seed

Date: 2026-11-16 · Status: requested by the owner

## Decision (FR-04, FR-05, FR-06; NFR-07)

- The local seed now includes realistic programs for the fictional clients. The source is TypeScript in `scripts/seed/` (builders, `mesocycles.ts`, `personalTraining.ts`, and the client catalog `programs.ts`). `pnpm seed:programs` renders it to `supabase/seed/programs.sql`, which `supabase db reset` applies after `seed.sql`. Edit the TypeScript, not the generated SQL. `tests/domain/seedPrograms.test.ts` fails if the SQL is stale.
- Content follows `samples/`:
  - Mesocycles use the 6-day legs/pull/push split, gym-specific exercise names, "X or Y" rows as alternatives, and RIR starting at 2 on primary rows and 1 on accessories. Sets are added week to week, and the last week is a deload with half the sets at RIR 3–4. A few accessories turn the last set into a drop set from week 3 (per-set targets).
  - Mesocycle targets are reps plus RIR only. Loads are logged results, so they are never seeded as prescriptions.
  - PT plans use the shared Warm-Up, Hip Mobility and Foam Rolling circuits. They include explicit lb loads, band colours, timed and per-side work, RPE ranges, per-set reps (`20, 18`), "A, B or C" stretches as alternatives, and one superset.
- Lifecycle coverage:
  - Maya: published block in week 3, plus an unpublished revision 2 that keeps node ids.
  - Daniel: an archived first plan and a current one.
  - Lucas (invited): a draft deliberately not ready to publish (2 unfinished exercises).
  - Noah (pending): a complete but unpublished plan.
  - Grace: both services.
  - Hannah and Ryan: published programs on ended services.
  - Sofia, Ethan, Owen and Zara: no programs, so they show empty states.
- Documents go through `save_draft`, `publish_revision` and `remove_program` as the seeded admin, so the database's contract and publish checks also validate the seed. Program rows are inserted directly to keep ids deterministic (stable URLs across resets) and to backdate `created_at`. Services that have ended are reopened just long enough to publish, then restored, including `archived_at`.
- pgTAP files that assert global visibility (`002`, `004`) run `truncate public.programs cascade` inside their rolled-back transaction. As a result, they also pass on a development database that holds local programs. The program-draft HTTP test scopes its client-B reads to its own program.
- Found while seeding: migration 00012 redefined `private.revision_document` and dropped `programTheme`. The editor then loaded drafts without the theme, and the next autosave cleared it. Migration 00013 restores the theme alongside `useSections`. The `004`/`007` round-trip documents now include `useSections`.

## Verification

- `pnpm db:reset`, then `pnpm test:db`: all 198 assertions pass (11 failed before, from the theme regression and from local data).
- `pnpm test:api`: 11 pass. `pnpm verify`: typecheck, 208 unit tests and the build pass.
- Seed result: 10 programs, 11 revisions, 827 exercises. Every published revision has zero server publish problems.
- No browser checks were run.
