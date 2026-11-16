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
| Clients dashboard (FR-02): service and status charts, invitation follow-ups with send/resend modal | Done | `src/features/clients/ClientsOverview.tsx`, `src/components/Dialog.tsx`, `tests/lib/clientTable.test.ts` |
| M3 step 4a: Grid model (typed columns, row-level rebuild, per-set lists, rectangular paste planning, clipboard) and `setPrescription` command | Done | `src/domain/programs/grid.ts`, `tests/domain/programGrid.test.ts` (14), decision 0007 |
| M3 step 4b: editor shell (program list, draft load/autosave, stale-draft conflict, unsaved-navigation guard), Program view | In progress | — |
| M3 step 4c: Grid view UI (keyboard navigation, paste preview dialog) | Not started | builds on `grid.ts` |
| Publishing UI | Not started | — |

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

## Known limitations

- **Programs:** no program, session, nutrition, import-batch or audit tables yet. Client Home shows honest empty states, not metrics.
- **Invitations:** invite and recovery emails have only been verified against local Mailpit. Real Resend delivery is untested.
- **Playwright:** not yet a project dependency. The browser smoke script lives outside the repo.
- **No linting:** no ESLint or formatter is configured yet.
- **Bundle size:** ~680 kB unsplit.
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
4. The Program view, then the Grid view (bounded typed columns, keyboard navigation, rectangular paste preview, atomic save), with stale-draft conflict handling. **In progress:** 4a grid model done (decision 0007); 4b editor shell + Program view and 4c Grid view UI next.
5. Add Playwright as a dev dependency and promote the smoke script to `tests/e2e`. Add ESLint and a formatter.
6. Start the `audit_events` table for publish and access changes.
