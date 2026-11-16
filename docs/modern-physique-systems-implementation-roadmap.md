# Modern Physique Systems — Implementation Roadmap

Version: 1.0 draft  
Prepared: November 16, 2026  
Status: Implementation guide; no production application has been built  
Product requirements: [MPS PRD](modern-physique-systems-prd.md)

## 1. Delivery approach

Build one small web application and one managed backend. Deliver vertical slices against real persisted data rather than completing every screen with mock data before addressing identity and storage.

The highest-risk areas are flexible imports, prescription/history separation, and revision-safe editing. Spike the importer early using representative files, then complete it against the stable program model. Do not postpone discovering parser limitations until the end.

All milestones below belong to the MVP. An internal core-program release can precede imports, but full client migration and the final launch gate require the reviewed importer for all three service families.

Use milestones and exit criteria instead of an invented calendar commitment. Estimate elapsed time after M0's corpus review and M1's parsing spike, including time for Matt's reviews. A small client count reduces operating load, not the need for access-control and import correctness.

## 2. Working agreement

- Inspect an existing repository and its instructions before scaffolding. Extend a suitable existing stack rather than replacing it without cause.
- Use the PRD as the behavioral contract. Keep its requirement IDs in work items and acceptance checks.
- Record assumptions and material decisions in short decision records. Resolve routine details without repeatedly asking permission.
- Keep milestones concrete: working behavior, migrations/contracts, verification, and a demonstration.
- Use synthetic/anonymized fixtures. Keep real source client files out of Git, screenshots, public previews, logs, and test artifacts.
- Do not claim a mock adapter or illustrative parse is a real integration. Demo mode must be explicit and must not silently replace a failed live backend.
- Do not create paid resources, send actual invitations, or deploy production without the appropriate user authorization. Local implementation and verification should continue independently.
- Preserve existing work and secrets. Never put privileged keys in frontend environment variables.

## 3. Proposed stack

| Concern | Starting choice | Reason and boundary |
|---|---|---|
| App | React + TypeScript + Vite | Private portal with no SSR requirement |
| Routing | React Router | Explicit protected client/coach routes |
| UI | Tailwind CSS and accessible component primitives | Consistent dark/gold visual system, usable forms/dialogs |
| Forms/validation | React Hook Form + Zod, or equivalent established repo choices | Shared runtime validation and typed form state |
| Remote state | TanStack Query, or equivalent | Cache invalidation, mutation states, retries; not a second program model |
| Grid | Bounded editable table initially | Avoid paid spreadsheet dependencies; use a maintained headless table if needed |
| Database | Supabase PostgreSQL | Relationships, transactions, migrations, RLS |
| Identity | Supabase Auth | Invitations, passwords, recovery, session handling |
| Files | Private Supabase Storage | Source uploads and authorized retrieval |
| Privileged API | Supabase Edge Functions + transactional PostgreSQL functions | Invitations, publish, import commit |
| Email | Existing Resend account via custom SMTP | Reuse available service |
| Hosting | Cloudflare Pages | Static app hosting; backend stays in Supabase |
| Tests | Vitest, database/RLS tests, Playwright | Pure domain/parser rules, isolation, and complete user flows |

These library names are proposed choices, not a mandate to add every package. Before installation, verify current maintained releases, security status, license suitability, and compatibility in official documentation; pin the selected versions and commit the lockfile.

For `.xlsx` and `.docx` parsing, choose libraries after the M1 benchmark. Prefer maintained packages that expose source structure and cell types, can run in a worker where appropriate, and do not execute active content. Do not assume “convert to CSV” or “convert Word to HTML” preserves the evidence this product needs.

## 4. Architecture boundaries

### Normal app requests

Browser → Supabase Auth → authenticated database/storage requests → PostgreSQL policies enforce ownership.

Use a browser-safe publishable/anon key with RLS; a project URL or browser key is not authorization by itself. Administrative secret/service-role credentials remain server-side only. Handle protected views/functions as carefully as tables.

### Invitations

Coach UI → authenticated Edge Function → verify owner/admin role → create/resolve client invitation → Auth admin operation → email delivered by configured Resend SMTP → verified callback binds the account to the intended client.

An email address supplied by the browser cannot claim a client record. A disabled client remains blocked by data policies even if an access token has not expired.

### Program editing and publication

One typed draft document → Program/Grid projections → validated draft save with expected version → atomic publish function → immutable published revision and current-program pointer.

Clients read the authorized published revision. Sessions carry a revision reference plus target snapshot. New publishing must not retarget existing sessions or rewrite completed results.

### Imports

Authorized client selection → private source upload/batch → bounded worker extraction → normalized draft plus evidence/issues → Matt resolves issues → server validates complete payload → transactional draft/history commit.

The browser worker keeps parsing responsive; it does not establish trust. The commit endpoint must verify client/service access, item bounds, IDs, normalized values, issue resolution completeness, and duplicate policy independently.

An Edge Function can receive a modest reviewed payload and call a database transaction. Do not perform large, unbounded ZIP/XML parsing in a short request handler. If real files exceed the chosen worker/request limits, fail visibly and decide whether a background service is justified.

## 5. Suggested repository layout

Adapt this to an existing repository rather than imposing a second structure.

```text
docs/
  modern-physique-systems-prd.md
  modern-physique-systems-implementation-roadmap.md
  decisions/
  operations/
src/
  app/                  # routes, providers, app shell
  components/           # shared accessible UI
  features/
    auth/
    clients/
    programs/           # canonical draft + both editors
    training/
    nutrition/
    home/
    progress/
    imports/            # upload/review/resolve/save flow
  domain/
    programs/
    measurements/
    calculations/
    imports/            # normalized contracts + profile recognition
  lib/                  # Supabase clients, safe configuration
  workers/              # bounded file extraction worker
supabase/
  migrations/
  functions/
  seed.sql              # synthetic local development data
tests/
  fixtures/imports/     # synthetic/anonymized corpus + expected output
  domain/
  policies/
  e2e/
```

Keep parser/domain code independent of UI components. Keep one program draft store/model and one persistence adapter. Components must not each maintain their own independently saved spreadsheet copies.

## 6. Data design and migrations

### Proposed core tables

These are an initial implementable design. Refine at M2 while retaining the PRD's invariants.

| Table/group | Key fields or constraints |
|---|---|
| `profiles` | `auth_user_id`, display name, timezone, preferred units; editable fields explicitly restricted |
| `staff_roles` | Protected `auth_user_id`, role; no self-promotion writes |
| `clients` | `id`, nullable unique `auth_user_id`, email, name, status, primary coach; stable before invitation |
| `coach_clients` | Explicit coach/client grants; unique pair |
| `service_enrollments` | Client FK, service enum, status, effective dates |
| `templates`, `template_versions` | Service, title, version; validated canonical content; published versions immutable |
| `programs` | Client/enrollment FKs, title, archived state, current published revision FK |
| `program_revisions` | Program FK, revision number, lifecycle status, draft lock version, published timestamp, source metadata |
| `program_weeks`, `workout_days`, `program_sections` | Revision FK through the hierarchy, order, dates, validated instruction blocks |
| `program_exercises`, `prescribed_sets` | Stable logical exercise key, order/alternative group, target ranges, load mode/value/unit, annotations |
| `sessions`, `session_exercises`, `logged_sets` | Client/program/revision relationship, target snapshots, actual date/times/status, original/substitute identity, actual measurements |
| `muscle_feedback`, `check_ins` | Session/client relationships, scores/due dates, submitted status |
| `nutrition_target_versions` | Program/client, effective dates, maintenance/goal/baseline; no overlapping effective periods for one active target stream |
| `bodyweight_logs` | Unique client/local measurement date, original value/unit, normalized value, provenance |
| `nutrition_daily_logs` | Unique client/activity date, intake/output estimates, notes; separate from weigh-in date |
| `coaching_updates`, `private_coach_notes` | Separate tables/policies for client-visible and private content |
| `import_batches`, `import_items`, `import_issues` | Authorized client, private object path, checksum, parser/profile version, raw evidence, normalized data, decisions, idempotency, release status |
| `audit_events` | Actor/action/object/time; controlled server writes and attributable corrections |

Use `timestamptz` for instants and `date` for local activity dates. Store timezones explicitly. Use numeric types for measurements and range endpoints; use text only where the underlying meaning is textual. Do not use floating-point equality to deduplicate measured values.

### Mandatory invariants

1. All related client/program/revision/session IDs must form a valid authorized parent chain. A valid FK alone is insufficient if it permits mismatched client IDs.
2. RIR `1-2` is a range, never a date; min ≤ max. Scalar targets use equal endpoints.
3. Client writes cannot change roles, owner/client IDs, prescriptions, private notes, audit authors, or import visibility.
4. Published content and session snapshots are immutable through ordinary edit paths.
5. A draft can have a mutable working structure, but publish freezes a revision transactionally. Enforce immutability in the database/function layer, not only the UI.
6. A session opened under revision A stays under A after revision B publishes.
7. A request retry with the same import idempotency key returns the same result.
8. Partial import/publish failure rolls back all domain changes in that transaction.
9. One local date produces at most one bodyweight and one nutrition record per client/type. Updating an existing record is explicit and attributed.
10. Null means missing/unanswered; zero is an actual value. Preserve that distinction in charts and calculations.
11. Draft-imported history stays staff-only. Publication can release that batch's history atomically after Matt reviews it; merely saving a draft cannot expose it to the client.
12. Explicitly excluded source items retain their provenance and decision even though they create no program fields.

### Migration order

1. Protected roles, profiles, clients, assignments, enrollments; baseline policies.
2. Templates/program hierarchy, target types, constraints, immutable revisions.
3. Sessions/results, feedback/check-ins, snapshot rules.
4. Nutrition targets/logs and uniqueness/effective-date constraints.
5. Updates/private notes, import provenance/issues, audit records, Storage policies.
6. Transactional functions, indexes, safe read models, export support.

Every exposed table must ship with its policies/grants. Never leave access control for a later “security pass.”

## 7. Contracts and domain behavior

### Canonical program document

Define a versioned `ProgramDraft` contract with program metadata, service, weeks/days/sections, exercises/alternatives, prescribed sets/ranges, resources, and notes. Both editor views and import normalization target this contract.

Keep results outside this document. A training target may contain `repMin/repMax`, `durationSeconds`, `loadMode`, `loadValue`, `unit`, `rirMin/rirMax`, `rpeMin/rpeMax`, and textual instructions. Validate valid combinations rather than requiring every field.

Changes are commands against stable IDs: update exercise, update target, reorder, duplicate, insert, remove. Use the same commands for Grid, Program, and reviewed import edits.

### Normalized import contract

Define a versioned `NormalizedImport` with:

- Batch/client/service identity, file checksum, parser/profile version, template classification.
- Proposed canonical program structure.
- Historical sessions/bodyweights/nutrition logs in a separate collection.
- Source items with stable IDs and source coordinates.
- Mapping decisions, explicit exclusions, and unresolved issues.
- Validation warnings, date/unit/classification choices, and summary counts.
- Commit mode, expected versions/overlap choices, and idempotency key.

A source location supports workbook sheet/cell/range or Word table/row/cell/paragraph. An item preserves raw value/type, available display text, formula/cached value, and normalized interpretation. Do not label inferred data as observed data.

### Suggested operation boundaries

| Operation | Required behavior |
|---|---|
| Invite client | Staff authorization; validated user/client binding; idempotent resend behavior; external email only when authorized |
| Save draft | Client/program authorization, expected lock version, full schema validation, atomic multi-cell changes |
| Publish revision | Lock/check draft version; validate readiness; freeze revision; update current pointer; release reviewed imported history; create update/audit event in one transaction |
| Save result | Session ownership and target snapshot checks; idempotent stable set IDs; no prescription mutation |
| Commit import | Validate batch/file ownership, limits, resolved/excluded items, semantics, duplicates, and complete graph; one transaction |
| Export client | Authorized scope; portable structured content plus provenance where appropriate; no private notes in a client-facing export |

## 8. Milestone overview

| Milestone | Outcome | Dependencies | PRD coverage |
|---|---|---|---|
| M0 | Repository/discovery decisions and reviewed fixture plan | None | Sections 3, 10, 15 |
| M1 | Early import feasibility spike and stable contracts | M0 | FR-12–16 |
| M2 | App foundation, identity, clients, data isolation | M0; incorporate M1 contract findings | FR-01–02, NFR-01–02 |
| M3 | Persistent program lifecycle and both editing views | M1–M2 | FR-04–06, FR-11 |
| M4 | Client training, logs, feedback | M3 | FR-07–08 |
| M5 | Nutrition and reviewed calculation engine | M2–M3; domain decisions | FR-09–10 |
| M6 | Home, progress, coach review | M4–M5 | FR-03, FR-10–11 |
| M7 | Complete reviewed import flow and atomic commits | M1, M3–M5 | FR-12–16 |
| M8 | Operations, integrated verification, accessibility | M2–M7 | FR-17, NFR-01–10 |
| M9 | Matt-led pilot, migration, release | M8 | Full acceptance checklist |

M1 is a bounded early experiment, not a separate production subsystem. Its useful parser/contracts become the basis of M7. Avoid building throwaway full interfaces during the spike.

## 9. Detailed implementation sequence

### M0 — Inspect, clarify domain rules, and prepare the work

Tasks:

1. Inspect repository, instructions, installed tools, existing services, and environment configuration without printing secrets.
2. Read both documents; create a small requirement-to-work-item checklist.
3. Identify available original files and design mockups. If absent from the repository, request them when needed; do not fabricate an exact importer from filenames alone.
4. Build an anonymized corpus matrix: each source family, normal/altered layout, mixed prescription/history, dates/ranges, annotations, invalid inputs.
5. Record unresolved calculation/notation decisions and sensible defaults. Separate pre-pilot domain signoff from choices that block coding now.
6. Create decision records for stack, versioning, importer boundaries, and client identity binding.

Deliverables: repository assessment, decision log, fixture manifest, initial backlog.

Exit: implementation can proceed without uncertainty about its core data boundaries. Missing Matt-only business decisions are enumerated rather than silently guessed.

### M1 — Import feasibility spike and contracts

Tasks:

1. Select and benchmark candidate `.xlsx` and `.docx` readers using maintained official releases and licenses.
2. Inspect workbook cells/types/merges/formulas and Word paragraphs/tables. Preserve raw evidence.
3. Prototype section recognition for one file in each family and one shifted-row/column variant.
4. Confirm contextual RIR range recovery, repeated set groups, BW/band/load annotations, alternatives, and historical-result classification.
5. Establish `ProgramDraft`, `NormalizedImport`, `ImportIssue`, `SourceLocation`, and typed measurement/range contracts.
6. Define the first profile's heading synonyms and expected structure. Unknown content becomes an issue, never an empty successful import.
7. Benchmark worker memory/time and compressed/expanded file limits from the PRD; validate the chosen request payload strategy.

Verification: golden normalized outputs, locations preserved, all meaningful items accounted for, no formula/macro execution, bounded corrupt-file failures.

Exit: documented evidence that the chosen approach can handle the known families and variations, or a concrete adjustment before the rest of the product depends on an impossible parser promise.

### M2 — Foundation, identity, and isolated client data

Tasks:

1. Scaffold or adapt the Vite/React/TypeScript app, route shell, design tokens, forms, error/loading/empty states, and environment validation. Follow the PRD's dark/gold palette and 7px standard-card radius.
2. Configure local Supabase and initial migrations/seed data. Use an admin and at least two distinct clients for isolation checks.
3. Implement protected role storage, client records, coach assignment, service enrollments, and client status checks.
4. Implement Auth session/recovery flows and server-side invitation/linking contract. Prepare Resend SMTP setup instructions without sending real email automatically.
5. Build Matt's client list/profile and service-filtered client navigation.
6. Add policies and direct API tests before connecting client data to the UI.

Verification: anonymous denial, client A/B isolation, no self-promotion, disabled-client denial, account-linking attacks, expired invites, and allowed staff paths. Local application build, types, and relevant tests pass.

Exit: a real persisted client record can be created and safely read by the intended identity. Demo data is clearly synthetic. Missing external credentials do not justify replacing integration failures with fake success.

### M3 — Program model, lifecycle, and two editors

Tasks:

1. Implement templates and client program revisions with draft locking and immutable published content.
2. Build the canonical draft model and persistence functions before either view creates independent state.
3. Implement Program view: week/day/section/exercise/set fields, ranges, notes, alternatives, preparation content.
4. Implement Grid view: bounded typed columns, keyboard editing, rectangular paste preview, validation, and atomic save.
5. Support exercise/day/week duplication with fresh IDs; template copies do not retain another client's actuals or identity.
6. Add save indicators, retry, unsaved navigation behavior, and stale-draft conflicts. Preserve failed edits until recovered or explicitly discarded.
7. Implement atomic publish, client preview, archive, and published update entries.

Verification: edits survive view switching and reload; range values never become dates; paste errors do not shift data; two editors cannot silently overwrite each other; client cannot fetch a draft; publish failure leaves the prior revision active.

Exit: Matt can author and publish a complete personal training or mesocycle program; the client can read it. Nutrition uses its dedicated target/log model rather than being forced into workout set columns.

### M4 — Training sessions, actuals, and feedback

Tasks:

1. Start a session against a published day/revision and capture the target snapshot.
2. Build mobile set logging, previous comparable performance, incremental saves, skip/substitution handling, timestamps, and session completion.
3. Separate original prescription from actual/substitute exercise identity.
4. Implement client corrections and staff corrections with attribution.
5. Add optional 0–3 feedback forms and reference guidance, preserving unanswered nulls.
6. Provide the coach with a basic session/result review view.

Verification: log on phone-size viewport; refresh after acknowledged save; retry after lost response without duplicate sets; publish mid-session; edit a completed result with audit attribution; log timed/BW/assisted/drop sets.

Exit: a workout flows from assignment through client logging to coach review with real database persistence and protected history.

### M5 — Nutrition and calculation engine

Tasks:

1. Add effective-dated calorie/maintenance/style targets and weight/baseline settings.
2. Implement separate weigh-in/activity dates and unique per-date upserts with conflict handling.
3. Build concise daily entry, recent history, and staff review/correction views.
4. Implement pure functions or well-defined SQL for rolling/weekly averages, coverage, balances, duration conversion, and period comparisons.
5. Reconcile sample workbook calculations independently; record legacy discrepancies instead of copying them.
6. Add the calorie-to-weight estimate only after Matt's rule review, distinctly labeled and separate from actual change.

Verification: yesterday/today mapping across timezones, Monday boundaries, daylight-saving transitions where relevant, kg/lb conversion, null vs zero, sparse weeks, target changes, repeated daily entry, and historical-import comparison.

Exit: clients can enter nutrition data and see consistent, coverage-aware summaries. Any metric awaiting Matt's domain signoff remains unavailable or explicitly labeled, not silently invented.

### M6 — Client Home, progress, and coach review

Tasks:

1. Build task derivation from enrollments, active assignments, session status, daily coverage, and configured feedback/check-ins.
2. Handle scheduled programs separately from sequence-only programs.
3. Build weekly status, one or two useful trends, and published coaching updates using persisted reads.
4. Build exercise histories, weight/target charts, and optional feedback history with clear units/coverage.
5. Ensure save mutations invalidate/update relevant Home and Progress data.
6. Add empty/new-client, no-active-program, partial-week, unavailable-history, and backend-paused/error states.

Verification: tasks deep-link correctly; saved entries change Home only after acknowledgement; no schedule means no invented denominator; service-only clients see appropriate sections; charts do not merge incompatible assisted/equipment data.

Exit: the first screen gives an accurate next action and honest progress summary, not decorative demo metrics.

### M7 — Complete import experience and migration integrity

Tasks:

1. Implement private upload, checksums, source metadata, worker lifecycle, cancel/retry, and bounded extraction.
2. Extend the M1 profiles to the agreed corpus, including Word preparation sections and nutrition's distinct activity dates.
3. Build Review with detected hierarchy, recognized columns, result classification, source excerpts, meaningful-item accounting, and error states.
4. Build Resolve with mapping choices, range/date/unit edits, original source evidence, exercise alternatives, annotation splitting, and explicit exclusion reasons.
5. Revalidate resolutions whenever their values change. Final commit remains blocked while unresolved meaningful issues exist.
6. Build Save draft with client/service confirmation, program title, history mode/date review, correction summary, duplicate/overlap warnings, and draft-only visibility.
7. Implement server revalidation and one transactional commit with idempotency keys and audit events.
8. Release imported history only as part of the appropriate publish operation; saving a draft is staff-only.
9. Implement per-client checksum duplicate detection and stable normalized history keys. Revised files can skip overlapping history or create a separate explicit draft; no automatic replacement.
10. Add failed-upload cleanup and safe unsupported-layout fallback retaining original evidence.

Verification: all parser fixtures; shifted/moved/merged structures; RIR dates; bodyweight/bands; decimal reps; unknown columns; ranges; date-system conversion; formulas/cached values; corrupt/encrypted/oversized ZIPs; missing dates; mixed history; duplicate/retry races; transaction failures; hostile normalized payloads.

Exit: Matt imports one representative file in each service family, resolves exceptions, saves the draft, checks both editing views, publishes, and verifies the intended client-visible program and history.

### M8 — Operational readiness and integrated quality

Tasks:

1. Connect the actual pilot Supabase environment and Resend configuration with least-privilege secrets and verified callback URLs.
2. Configure Cloudflare Pages build, SPA deep-link fallback, environment-specific values, headers, and private-preview protections where needed.
3. Ensure production builds never include real source fixtures, mock backend fallbacks, admin secrets, or demo identities.
4. Implement privacy-safe error visibility, storage/database usage checks, and failed import cleanup.
5. Add client export and operational data-correction/deletion procedures.
6. Establish encrypted daily database exports and separate file backups. Restore both into a clean test environment and document elapsed recovery.
7. Run cross-client/file/function/view policy checks, end-to-end acceptance journeys, keyboard/mobile checks, and representative import performance checks.
8. Document paused-project recovery, missing SMTP, expired invite, failed save, import cleanup, rollback, and emergency access revocation.

Verification: full release gate in section 12. Re-run only affected checks after fixes, then the integrated release paths if shared contracts changed.

Exit: the app is ready for a controlled pilot with a practical recovery path. Deployment is a separate authorized operation; do not treat a successful local build as a production launch.

### M9 — Matt-led pilot and rollout

Tasks:

1. Walk Matt through new-client assignment, Program/Grid edits, publishing, importing, history review, and corrections.
2. Pilot with a few explicitly selected clients across the three service types. Start with copies of source files; retain originals.
3. Verify the first real migrations side by side with their source and correct profile issues before bulk migration.
4. Observe task discovery, set entry, nutrition entry, and program-editing friction. Measure the PRD's proposed usability targets.
5. Resolve data-loss, permission, history, and import issues before onboarding more clients; polish lower-impact presentation issues afterwards.
6. Record Matt's calculation approvals, retention decisions, migration results, and final launch signoff.

Exit: Matt and pilot clients complete their normal workflows, source/actual distinctions are correct, and all release-blocking issues are closed.

## 10. Importer design in detail

### Pipeline

1. **Preflight:** verify file signatures, archive safety, size/sheet/cell limits, supported type, and permissions.
2. **Extraction:** read workbook/document structure without executing active content. Keep raw values, types, merges, formulas/caches, and positions.
3. **Recognition:** identify template profile, headings/synonyms, repeated set groups, program sections, and unit/date context.
4. **Classification:** separate identity metadata, instructions, prescribed targets, actual history, calculated summaries, and ownership/resource text.
5. **Normalization:** create typed program/history records with provenance and an explicit issue for every uncertain conversion.
6. **Reconciliation:** account for every meaningful source item as mapped, excluded, or unresolved; compare retained source summaries with app calculations where supported.
7. **Review:** let Matt inspect source and destination, change mapping, split annotations, fix dates/ranges, and explicitly exclude content.
8. **Validation/commit:** server revalidates authorization and normalized contracts; transactionally saves a new draft and pending history.

### Recognition rules

- Match semantic headings and their relative structure rather than fixed cell addresses.
- Maintain controlled synonyms, such as `Calories Day B4` and `Calories Consumed Day Before`.
- Detect repeated Weight/Reps pairs and associate them with a set index.
- Preserve blank, zero, skipped, not applicable, and text annotations as different states.
- Use structural labels to identify dates. A value in an RIR column is not a date merely because Excel typed it that way.
- Check workbook date-system metadata. Recovering `1-2` from a converted date is a proposed interpretation, not a license to reinterpret every date-like value.
- Recognize `A or B` as an alternative requiring review, not automatically two workouts/exercises.
- Resolve load units from explicit evidence or Matt's reviewed mapping. No naked number silently becomes pounds.
- Treat shared/cached formulas as source evidence. The app's own calculation engine replaces only supported, reviewed calculations.
- Use bounded heuristics and source evidence; do not invent a precise numerical confidence score without calibration. “Recognized,” “needs review,” and “unsupported” are sufficient statuses.

### Failure and fallback behavior

If recognition fails, show the original sections/columns and offer manual mapping or cancellation. Never save an empty “successful” program. A client program must remain unaffected by parsing or upload failure. Unexpected formulas/external references stay inert and visible as warnings where relevant.

## 11. Test strategy

Use tests that prove risky behavior rather than reproducing component implementation details.

| Layer | Essential checks |
|---|---|
| Domain functions | Ranges, units/load modes, missing data, date boundaries, weighted attribution rules, valid target combinations |
| Parser contracts | Golden outputs with source locations; all meaningful content accounted for; deterministic normalization |
| Database | Constraints, expected-version saves, immutable revisions, atomic publish/import, idempotency and retry races |
| Policies | Anonymous/A/B/disabled users, unassigned coach, admin; forged parent IDs; private notes, stored files, views, and privileged functions |
| UI integration | Program/Grid consistency, paste validation, save/error/conflict states, issue correction and revalidation |
| End-to-end | Invite/login → assigned program → set log → Home update; nutrition → trend; import → resolve → draft → publish → client visibility |
| Recovery | Database + source-file restore, service pause, expired invite, failed network request, lost commit response |
| Accessibility/performance | Phone layouts down to 320px, keyboard flow, focus, contrast, chart labels/units, worker cancellation and representative file limits |

### Minimum fixture matrix

- One base `.xlsx` mesocycle, one nutrition `.xlsx`, and one personal-training `.docx` fixture.
- Inserted columns, variable blank-row spacing, moved sections, merged headings, repeated headers, and reordered days.
- RIR numeric/scalar/range/date-converted values; sets and RPE ranges.
- BW, assisted load, band colors, `ds`/other unrecognized annotations, decimal reps, timed/per-side exercise text, alternatives.
- Nutrition preceding-day dates, unit ambiguity, missing daily entries, formulas/cached values, conflicting headers/activity dates.
- Word tables interrupted by paragraphs/preparation sections and unsupported freeform content.
- Corrupt, encrypted, unsupported, oversized, and pathological compressed input.
- Duplicate upload, overlapping revised history, incomplete resolution, deliberate exclusion, invalid range, lost response, and interrupted/rolled-back commit.

Golden output must be independently reviewed. A snapshot of the parser's own wrong output is not an acceptance oracle.

## 12. Release gate and operational checklist

### Required journeys

1. Matt creates a client and assigns multiple services.
2. Matt creates a program, edits both views, pastes a valid range, and publishes.
3. Client signs in, sees the correct Home tasks, records a set and nutrition entry, reloads, and sees saved progress.
4. Matt publishes while a client has an in-progress session; that session retains its original targets.
5. Matt imports each file family and altered-layout example, resolves unknowns, chooses history mode/dates, saves, reviews, and publishes.
6. A simulated retry produces one import; a transaction failure produces no partial program/history.
7. A second client and an unauthenticated user cannot access the first client's records, drafts, private notes, or files through direct calls.
8. A disabled client's existing session cannot read protected data.
9. A failed save visibly retries without losing acknowledged work or fabricating success.
10. A database and file backup restore succeeds and yields matching program/history counts.

### Setup before pilot deployment

- Matt owns production Cloudflare/Supabase/Resend accounts or grants explicit delegated access.
- Use a test environment and production environment with separate data/secrets. Two free Supabase projects may fit the initial setup; verify account limits.
- Configure invite/recovery URLs, sender-domain DNS and SMTP, application origin restrictions, private buckets, and policies.
- Store production secrets in provider secret stores; ship only browser-safe configuration to the frontend.
- Set cost/usage monitoring; record quota thresholds and pause recovery steps.
- Back up the database and storage separately, encrypted and accessible only to authorized operators.
- Keep real client data out of preview/demo deployments and development fixtures.
- Record schema migration/rollback steps. Prefer backward-compatible migrations; avoid destructive production migrations without a reviewed recovery plan.
- Validate a rollback to the prior app build against the migrated schema.

## 13. Initial hosting and cost assumptions

Checked November 16, 2026; these are planning inputs and must be checked again at deployment.

| Component | Initial plan | Upgrade trigger |
|---|---|---|
| Cloudflare Pages | Free static hosting | Actual build/file/function needs exceed published limits |
| Supabase | Free database/Auth/private Storage | Inactivity pausing disrupts service, backup/reliability needs increase, or measured quotas approach limits |
| Resend | Existing account | Actual sending/delivery requirements exceed its allowance |
| Domain | Existing domain or provider address | Buy/connect a domain when chosen by Matt |

Supabase Free currently includes a 500 MB database and 1 GB storage and may pause after a week of inactivity. Cloudflare static requests are free and unlimited; static hosting allowance does not remove Supabase database/storage/egress limits. Do not bypass inactivity limits with artificial traffic. Budget later based on observed usage.

Sources: [Supabase pricing](https://supabase.com/pricing), [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Cloudflare Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Supabase backups](https://supabase.com/docs/guides/platform/backups).

Vercel is a possible paid alternative, but its Hobby plan is not the business-use assumption: [Vercel pricing](https://vercel.com/pricing).

## 14. First implementation handoff

Start with M0, M1's bounded contract/parser feasibility work, and M2's local foundation. The first reviewable increment should contain:

- A repository assessment and concise decision log.
- A bootable branded app shell and protected client/coach route boundaries.
- Reproducible local Supabase migrations and synthetic admin/two-client seed data.
- Baseline policies and direct cross-client isolation tests.
- Typed program/measurement/import contracts, including range semantics and separated history.
- An initial parser fixture/spike if real or anonymized source files are available; a clearly identified missing-corpus dependency otherwise.
- Environment/setup documentation, passing build/types/relevant tests, and a next-milestone checklist.

Do not build all screens as disconnected mockups, add paid services, launch production, or claim full imports in this first increment. If external credentials are missing, complete local work and list exactly what is needed for real integration.

## 15. Definition of done per milestone

A milestone is done when its intended user behavior works against the appropriate real local/test integration, related migrations/contracts are committed to the working tree, meaningful checks pass, failures/limitations are documented honestly, and the next milestone has a stable interface to build upon.

The entire MVP is done only when the PRD acceptance checklist and M9 pilot gate pass. Attractive mockups, a deployed login page, or a successful happy-path sample import alone do not satisfy that definition.
