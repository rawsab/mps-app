# Modern Physique Systems — Product Requirements Document

Version: 1.0 draft  
Prepared: November 16, 2026  
Product owner: Matt Lizmore, Modern Physique Systems (MPS)  
Status: Ready for implementation planning; no production app has been built  
Companion: [Implementation roadmap](modern-physique-systems-implementation-roadmap.md)

## 1. Product summary

Build a branded, mobile-friendly web app for MPS's personal training, mesocycle programming, and nutritional programming services. Matt manages clients and programs; clients sign in, see their next actions, log their activity, and review progress.

The product preserves Matt's spreadsheet-based working habits through a structured grid editor while giving clients an app organized around their daily needs. A Program view and Grid view edit the same records. Existing Excel, Word, Google Sheets, and Google Docs content enters through a reviewed import workflow.

This is a single-business application for a small initial client base. Prefer managed services, conventional relational data, and a small number of deployable components. The importer is a bounded migration tool for Matt's template families, not a universal spreadsheet interpreter.

## 2. Problem and desired outcomes

Today, client programs and results are distributed across spreadsheets and documents. Clients must navigate layouts designed partly for coaching and calculations. Matt must maintain those documents directly and carry previous results forward manually.

The MVP should let:

- A client understand their next action immediately after signing in.
- A client log a workout or nutrition entry easily on a phone.
- Matt create, duplicate, edit, and publish programs without maintaining parallel app and spreadsheet copies.
- Matt migrate an existing client's file without manually reconstructing every exercise and entry.
- Both parties distinguish prescribed targets from actual performance.
- Matt retain completed workout history when a program changes.

The smallest useful release includes all three services, both coach editing views, and reviewed imports for the three known template families. A core editor without migration may be an internal milestone, but it is not the completed MVP.

## 3. Evidence and product decisions

### Reviewed source templates

| Source | Observed structure | Product implication |
|---|---|---|
| `Mesocycle Sample (Google Drive)(1).xlsx` | Week 1 and Additional Resources sheets; six training days; per-set weights/reps; RIR goals; muscle set totals; session times; optional stimulus, soreness, and performance feedback | Multiweek/day training structure, set-level logging, explicit ranges, optional assessment sections, reusable resources |
| `Nutrition Template Sample (Google Drive)(1).xlsx` | Four-week conservative bulk; daily weights; preceding-day intake/output; averages and calorie balances; predicted and measured weight changes | Separate weigh-in and intake dates, nutrition targets with effective dates, defined weekly calculations |
| `Personal Training Document Sample(1).docx` | Warm-up, hip mobility, two full-body days, foam rolling, sets, reps, load, RPE, timed movements, notes | Use the shared training model with configurable preparation sections and RPE support |

The mesocycle sample contains one supplied week. The application supports arbitrary program length; four weeks is an example and a convenient default, not a hard limit.

### Agreed decisions

1. Client experience defaults to an app, with small tables where they aid logging.
2. Client navigation is Home, Training, Nutrition, and Progress, filtered by assigned services.
3. Matt has Program and Grid views over one program model.
4. Drag-and-drop migration is part of the MVP.
5. Layout variations, extra columns, blank rows, and shifted sections must be tolerated within the supported template families.
6. `1-2` in an RIR field means between one and two reps in reserve. It is not a date. Store it as a numeric range.
7. Historical results and future prescriptions remain distinct.
8. The small initial client base can start on free hosting/database tiers. Resend is already available.
9. Dark gray, black, and gold branding follows the supplied templates.
10. The existing chat mockups illustrate interaction and visual direction. They are not production code, approved business calculations, or proof that file parsing exists.

### Source issues requiring explicit reconciliation

- Some RIR range entries have already been converted by Excel into dates. Recover only with field context and review; preserve source evidence.
- Excel session times are fractions of a day. Elapsed minutes require correct conversion and overnight handling.
- Some muscle summaries reference unexpected cells/categories. Do not copy those references into app logic without review.
- Nutrition uses a different weight-change calculation in week one than in later weeks.
- Nutrition sample log dates do not match its received-date label. Treat identity/header metadata and activity dates separately.
- Training alternatives, bodyweight, band colors, annotations, and decimal reps appear in the sources. Do not coerce them into a single numeric weight or integer-only rep field.

## 4. People and permissions

### Personas

**Matt — owner/admin and coach:** manages the business's clients, reusable templates, programs, publishing, imports, results, and private coaching notes.

**Client:** sees their own published programs and released history; logs their actual activity, nutrition, and feedback; reads client-visible coaching notes.

An additional assigned-coach role may be supported in the access model, but a staff-management interface is not necessary for the MVP. New staff must never gain all-client access merely by creating an account.

### Access matrix

| Capability | Matt/admin | Assigned coach, if enabled | Client |
|---|---|---|---|
| Manage client access and service enrollment | All MPS clients | No by default | No |
| Create/edit/import client programs | All MPS clients | Assigned clients | No |
| Publish/archive client programs | Yes | Assigned clients if explicitly granted | No |
| Read program drafts | Yes | Assigned clients | No |
| Read published programs | Yes | Assigned clients | Own only |
| Log/correct results | Yes, attributed | Assigned clients, attributed | Own only |
| Change prescribed targets | Yes | Assigned clients | No |
| Read/write private coaching notes | Yes | Assigned clients | No |
| Manage roles and platform configuration | Yes | No | No |

Database and file-storage policies enforce this matrix. Route guards and hidden buttons improve navigation but do not provide authorization. Keep roles separate from client-editable profile fields.

## 5. Scope

### Included in MVP

- Invitation-based client sign-in, sign-out, and password recovery.
- Client management and multiple concurrent service enrollments.
- Client Home, Training, Nutrition, and Progress experiences.
- Shared training model for personal training and mesocycles.
- Program view and a focused spreadsheet-style Grid view.
- Reusable templates, client-specific drafts, revision history, publishing, and archiving.
- Set-level logging, session notes, substitutions, timed activities, RIR/RPE targets, and optional feedback.
- Nutrition targets, daily logs, weekly summaries, and basic trends.
- Reviewed `.xlsx` and `.docx` imports for the supplied template families and representative variations.
- Explicit separation of historical results from prescriptions during import.
- Private source-file storage, import provenance, conflict checks, and audit history.
- Basic backup/export and tested restoration procedures.

### Excluded from MVP

- Native iOS/Android applications, app-store distribution, offline-first logging, and wearable integrations.
- Billing, subscriptions, booking, meal databases, barcode scanning, and food recommendation engines.
- Live Google Drive synchronization or two-way spreadsheet synchronization.
- Chat, social feeds, push notifications, and complex reminder systems.
- Arbitrary Excel layout/formula editing, macros, and a universal import engine.
- AI-generated programs or automatic progression changes.
- Progress photos/video libraries and multi-business SaaS administration.

Google Sheets files are exported as `.xlsx`; Google Docs files as `.docx`. Older `.xls` and `.doc` files require conversion before import.

## 6. Information architecture and visual design

### Client navigation

- **Home:** next actions, this week's status, compact trends, and Matt's updates.
- **Training:** assigned programs, week/day selection, exercise details, and logging.
- **Nutrition:** active targets, daily entry, history, and weekly summaries.
- **Progress:** exercise history, weight trends, completion, and feedback history.

Hide unavailable service sections rather than presenting empty modules. An ended service blocks new assignments and new service logging; previously published programs and historical records remain readable unless Matt revokes client access. The final retention policy is configured before pilot.

### Matt's navigation

- Clients and individual client workspaces.
- Templates.
- Reviews: recent logs, submitted check-ins, and items awaiting attention.
- Account/settings access for identity and operational configuration.

### Visual direction

Use gold `#C8A55D`, near-black `#0A0A0A`, dark surface `#171717`, gray supporting surfaces, and readable light text. Use gold for primary actions, selected states, and key targets. Confirm contrast on actual surfaces; status meaning must also have text or icons.

Use the official MPS logo when supplied. Until then, a text wordmark is sufficient; prototype lettering is not a newly approved brand asset. Use a restrained 7px default corner radius for standard cards, reflecting the mockup adjustment; adapt controls and larger application frames consistently. Carry over relevant ownership notices and reference guidance.

Client layouts must work at 320px and above. Matt's grid may use contained horizontal scrolling on narrow screens; the surrounding page must not overflow. Controls require visible labels, keyboard focus, and usable touch targets. Do not require hover to reach essential actions.

## 7. Functional requirements

Requirements use stable IDs so implementation work and verification can reference them.

### FR-01 — Identity and invitation

- Matt creates a client record before or during invitation; an uninvited client can already have a draft imported program.
- Invitations bind an authenticated user to the intended client record through a server-validated flow. Do not grant access based on a client-supplied ID or unverified email match.
- Support email/password sign-in, sign-out, account recovery, expired invitations, and duplicate email/account cases.
- Reuse Resend for transactional email through Supabase custom SMTP.
- Disabled clients cannot read or modify protected app data through existing sessions.

Acceptance: an invited client signs in and sees only their records; an expired invitation offers recovery; an unauthenticated request cannot read client data.

### FR-02 — Clients and services

- Matt can create, find, update, deactivate, and reactivate a client.
- Each client can have personal training, nutrition, mesocycle programming, or combinations.
- Enrollment records contain service, status, effective start/end dates, and assigned coach where relevant.
- Display relevant programs and tasks without duplicating the same assigned workout across services.

Acceptance: training-only and nutrition-only clients receive appropriate navigation and Home content.

### FR-03 — Client Home

- Show next incomplete workout, nutrition entry due, and feedback/check-in tasks that arise from actual assignments.
- Use scheduled dates when provided. Without dates, show the next incomplete session; do not invent an overdue deadline.
- Show completed workouts versus scheduled/planned sessions for the current program week, nutrition log coverage, and next scheduled check-in.
- If no schedule establishes a weekly denominator, display completed sessions without an invented target.
- Show one or two service-relevant trends, initially covering four weeks, plus recent published coaching updates.
- Each task opens the exact workout or form. Saving it updates its corresponding Home state.
- A completed task is based on saved data, not a local button click alone.

Acceptance: first-use, partial-week, missed-entry, completed-week, and no-active-program states are coherent. Missing data never becomes zero performance.

### FR-04 — Program lifecycle and templates

- Create a program from scratch, a reusable template, a duplicated client program, or an import.
- Each client assignment is independently editable. Editing a master template does not rewrite assigned programs.
- Support variable program length, named weeks, days, preparation blocks, exercises, resources, and coach instructions.
- Drafts are Matt-only. Publishing makes a validated revision available to the assigned client.
- Completed/in-progress sessions retain the revision and target snapshot that applied when they started.
- A later revision affects future sessions. An in-progress session can adopt changes only through an explicit future workflow; automatic replacement is excluded.
- Archiving preserves history. Do not delete completed records when changing or ending a program.

Acceptance: Matt publishes a change while a client has an in-progress session; that session remains intact and subsequent sessions use the new revision.

### FR-05 — Matt's Program view

- Edit program settings, weeks, workout days, preparation sections, exercises, ranges, notes, and resources.
- Add, reorder, duplicate, remove from a draft, and group exercises.
- Represent alternatives explicitly. An exercise labeled “A or B” is not automatically two required exercises.
- Support optional exercise demonstration links as URLs, without building video hosting.
- Preview the client experience before publishing.

Acceptance: a personal training program with warm-up, mobility, timed stretching, and RPE targets uses the same editor as a mesocycle with RIR goals.

### FR-06 — Matt's Grid view

- Show structured program fields in an editable grid: exercise, order, sets, rep/time targets, load mode/value/unit, RIR/RPE ranges, and notes.
- Provide keyboard navigation, field validation, rectangular paste, and day/week duplication.
- Paste previews and validates multi-cell changes before committing them as one operation; a bad cell must not silently shift neighboring values.
- Both editor views consume one canonical draft. Switching views preserves changes and validation messages.
- Grid edits do not modify client result tables.
- Track unsaved/saving/saved/error states and detect stale revisions before overwriting another edit.

Acceptance: change a target in Grid, switch to Program, and verify the identical saved target. A stale second editor receives a conflict message and retains its edits for review.

### FR-07 — Training logs

- Display prescribed targets next to actual results, with recent comparable performance where available.
- Record actual load, units/mode, reps including supported decimals, duration, RIR/RPE, annotations, and set completion.
- Support bodyweight, assistance, band labels, per-side instructions, drop-set annotations, skipped exercises, and substitutions.
- Clients can correct their own logs; Matt can correct them with visible attribution and audit history.
- Record session start/end time, actual date, status, and notes. A skipped session differs from an incomplete or completed session.
- In-progress logging saves incrementally and survives a page reload after server acknowledgement.
- A substituted exercise preserves the original prescription and records what was actually performed.

Acceptance: logging “BW,” an assisted load, a timed hold, an RIR range target, and a drop set does not corrupt numeric chart data.

### FR-08 — Training feedback

- Collect optional muscle-specific challenge, pump, disruption, soreness, and performance responses using the template's labels and 0–3 scales.
- Show explanatory resources at the point of entry.
- Feedback belongs to a session and muscle group; unanswered fields remain null.
- Show the submitted feedback to Matt. Suggestions may display the reviewed reference rubric, but must not automatically change a client's prescription.

Acceptance: an unanswered optional assessment never blocks workout completion or appears as a score of zero.

### FR-09 — Nutrition

- Matt assigns a program style, maintenance estimate, calorie goal, dates, and optional starting weight/baseline.
- Targets have effective dates so changing a goal does not relabel past logs against today's target.
- Clients log body weight, calorie intake, estimated output if used, and notes.
- Separate measurement date from intake/output activity date. The interface can say “today's weight” and “yesterday's calories” explicitly.
- Each client has at most one bodyweight record and one nutrition activity record per local date; edits update those records.
- Separate provided source values, measured results, estimates, and calculated summaries.

Acceptance: a Monday weigh-in with Sunday's calorie intake lands on the correct dates; changing the current calorie goal leaves Sunday's target history unchanged.

### FR-10 — Progress and calculations

- Provide weekly-average weight, daily calorie balance, calorie/target history, workout completion, selected exercise histories, and optional feedback history.
- Show actual load and reps together; do not equate assisted load with lifted load or assume all equipment loads are comparable.
- Mark substitutions/equipment changes rather than silently combining incompatible performance series.
- Show trends only when enough source data exists and disclose coverage.
- Apply the calculation definitions in section 10 consistently in Home and Progress.

Acceptance: a missing nutrition day is not treated as zero intake; a week with one weigh-in does not present a confident weekly trend.

### FR-11 — Notes and updates

- Support client-visible program instructions and coaching updates.
- Store private coaching notes separately from client-visible content.
- Publishing a program update can create a client-visible update entry.
- There is no chat requirement or guaranteed email reminder system in this release.

Acceptance: a client cannot retrieve private notes through direct API requests, exports, or joins.

### FR-12 — Import entry and source files

- Start import within a selected client's workspace; show the destination client and service prominently.
- Support drag/drop and a normal file picker for `.xlsx` and `.docx`.
- Validate extension, content signature, archive limits, and file size. Unsupported/encrypted/corrupt files produce an actionable error.
- Initial engineering limits: 10 MiB compressed, 100 MiB total expanded XML/text, 50 worksheets, 50,000 nonempty cells, and 30 seconds per parse attempt. Confirm against representative real files before pilot; exceeding a limit fails visibly rather than truncating.
- Keep source files private and accessible only to authorized staff. Never put a real client file into the public site bundle or source repository.
- The actual app parses selected content. The design prototype only illustrates sample extraction and must not be mistaken for a functioning parser.

### FR-13 — Flexible extraction and recognition

- Identify template family, headings, sections, repeated set columns, units, notes, and program hierarchy using structural evidence and heading synonyms.
- Tolerate inserted columns, extra blank rows, repeated headings, merged cells, moved blocks, and variation in row spacing.
- Decode workbook date systems and shared formulas where needed for inspection. Preserve raw cell types, displayed text where available, formulas/cached values, and locations.
- Extract Word tables plus surrounding paragraphs; keep preparation sections and section notes in order.
- Every meaningful source item must end up mapped, deliberately excluded, or unresolved. Never silently drop unrecognized content.
- Do not execute formulas, macros, external links, or embedded active content. Recompute only explicitly supported app calculations.
- Use deterministic parsers for MVP. AI interpretation is not required and is not an automatic fallback.

### FR-14 — Review and correction

- Four steps: Choose file → Review program → Resolve fields → Save draft.
- Review shows detected weeks/days/exercises, historical entries, recognized column mappings, skipped spacing, and issues.
- Display source excerpts next to normalized program fields, with sheet/cell or document-table/paragraph provenance.
- Allow correction of headings/destinations, dates, units, ranges, exercise identities/alternatives, and notes; support explicit exclusion with a reason.
- Demonstrate and implement the three prototype cases: date-converted RIR, an unknown tempo column mapped into notes or excluded, and `90 ds` split into numeric load and set annotation.
- A meaningful unresolved item blocks final commit. A user may explicitly exclude an item instead of resolving it into a field.
- Editing a previously resolved value invalidates its resolution until confirmed again.
- Source location and raw value remain retained after correction. Existing formulas are evidence, not instructions to execute.

Acceptance: Matt fixes an RIR range, maps the tempo column to exercise notes, confirms a drop set, and sees those exact choices in the final summary and draft.

### FR-15 — Prescription/history classification

- Treat mixed files as potentially containing instructions, prescriptions, and historical results. Filled weight/rep cells are not automatically future targets.
- Offer Program structure only or Program and historical results. Show exactly which fields each mode includes.
- If a number's role is ambiguous, ask Matt to classify it during review.
- Historical activity dates must be supplied or explicitly confirmed. Never derive them solely from a received-date header.
- Imported historical logs stay coach-only with the draft until the associated import is released when publishing. The final save summary explains this.
- Sample/template result values cannot become a real client's completed activity by default.
- When only structure is imported, Matt supplies future target loads/reps in the editor where they were not actually prescribed in the source.

### FR-16 — Import commit, duplicates, and conflicts

- Final review includes destination client/service, program name, counts, corrections/exclusions, history inclusion/dates, and draft visibility.
- Commit creates a new program draft and associated pending history in one database transaction. It does not publish or overwrite an active program.
- A file checksum scoped to the client detects likely duplicates; normalized record keys help identify overlapping history from revised files.
- Retry uses the same idempotency key and returns the original result rather than duplicating records.
- Duplicate handling supports cancel, explicitly create a separate draft, or skip overlapping historical entries. Replacing existing records requires a later explicit reconciliation flow and is excluded from MVP.
- A failed database transaction leaves no partial assigned program or history. Temporary source uploads may remain with a failed batch and are cleaned according to retention policy.

Acceptance: retry after a simulated lost response creates exactly one draft; a second upload of the same file warns before creating new data.

### FR-17 — Auditing, exports, and recovery

- Audit staff changes to programs, results, enrollment/access, import decisions, publishing, and sensitive administrative actions.
- Allow Matt to export a client's structured program/log data in a documented portable format; do not promise Excel layout round-tripping.
- Provide client account/data correction and deletion request handling through Matt's operational process. Automated self-service deletion is not required.
- Maintain encrypted database exports and separate source-file backups, with a verified restore procedure.
- Do not place actual weights, notes, emails, tokens, or source-file contents in application telemetry.

## 8. Core workflows

### New client

Matt creates a client → assigns services → creates/imports a draft → verifies targets → publishes → invites the client → client signs in and sees relevant Home tasks.

Invitation can happen earlier, but a client without a published program sees a helpful empty state, not a draft.

### Daily client use

Client signs in → sees next action → opens workout or nutrition entry → logs results → receives saved confirmation → Home updates from saved records → Matt can review the activity.

### Editing an existing program

Matt opens client → creates/opens draft from current revision → edits in either view → validates → previews → publishes atomically → future sessions use the new revision; existing sessions retain their snapshot.

### Migrating an existing client

Matt selects client → drops a source file → receives parsing progress or actionable failure → reviews sections/mappings → resolves ambiguous entries → chooses structure/history → confirms dates and duplicate handling → saves draft → reviews in both editing views → publishes when ready.

No source upload alone changes what the client sees.

## 9. Conceptual data model

This is a product model, not a mandated final SQL schema. The roadmap proposes implementation boundaries.

| Entity | Important information and rules |
|---|---|
| Auth user / profile | Identity, display name, timezone, preferred units; no client-writable role |
| Protected staff role | Admin/coach capability, assigned server-side |
| Client | Stable client ID; nullable unique auth user link; email, status, primary coach; can exist before invitation |
| Coach assignment | Explicit authorized staff/client relationship when additional coaches are used |
| Service enrollment | Client, service, effective dates, status |
| Template/version | Reusable validated structure and immutable template revisions |
| Client program/revision | Enrollment/client, service, status, dates, published/draft versions and optimistic concurrency number |
| Week/day/section | Ordered structure, optional schedule, preparation/instructions/resources |
| Exercise/prescribed set | Exercise identity, alternatives, per-set/range targets, load semantics, notes |
| Session/session exercise/logged set | Actual activity, program revision and target snapshot, dates/times, substitutions, provenance |
| Muscle feedback/check-in | Actual responses, scales, muscle/session references, due/submitted status |
| Nutrition target version | Effective date range, calorie goal, maintenance estimate, style/baseline |
| Bodyweight/nutrition daily log | Distinct measurement/activity dates and units; unique dates per client/type |
| Coaching update/private note | Separate visibility and authorization boundaries |
| Import batch/item/issue | Source file/checksum, parser version, evidence, normalized output, resolution, status, idempotency |
| Audit event | Actor, action, object, timestamp, relevant change attribution |

Ranges use typed minimum/maximum values, not date strings. Repeated sets are rows, not six permanently hardcoded set columns. Flexible instructions use validated text/content blocks. Numeric values retain explicit units and source semantics.

## 10. Calculation and calendar rules

These defaults make implementation possible; Matt reviews the identified domain choices before client pilot.

| Topic | MVP definition |
|---|---|
| Calendar | Client timezone for activity dates; UTC timestamps for instants; Monday–Sunday weekly dashboard periods unless a program explicitly defines a different week |
| Program week | Explicit week index/start date; do not infer week boundaries from source row positions |
| RIR/RPE | Typed min/max; scalar values use equal endpoints; RPE 0–10; RIR nonnegative with a reviewed operational ceiling; preserve unusual source text as an issue |
| Weight units | Store original unit and normalize only with an explicit conversion; pounds/kilograms are not inferred from a bare number |
| Rolling weight | Last seven calendar dates, using actual non-null measurements; show coverage `n/7`; at least three measurements required to display an average trend |
| Weekly weight | Average actual measurements in the named week; show coverage; compare weekly means only when both periods meet coverage, without requiring seven entries |
| Mesocycle measured change | Difference between first and last qualifying weekly averages; label periods. If insufficient data, show unavailable rather than switching formulas silently |
| Calorie balance | Intake minus estimated output for the same activity date; unavailable if either input is absent |
| Weekly calorie totals | Sum recorded balances and show coverage; incomplete weeks are explicitly partial, never projected without a separate labeled estimate |
| Predicted weight change | Preserve the template's energy-balance/3,500 kcal-per-lb heuristic as a labeled estimate only after Matt confirms it; measured change stays separate |
| Duration | End instant minus start instant; handle overnight sessions; convert Excel day fractions with 1,440 minutes/day; reject or flag ambiguous imported dates/times |
| Set attribution | Basic performed set counts are available; fractional muscle attribution requires explicit, Matt-reviewed exercise/muscle weights. Keep unsupported source totals as reviewed legacy values, not invented app results |
| Completion | Completed sessions against assigned planned sessions; skipped/in-progress are distinct statuses; do not compute an adherence percentage without a valid denominator |

An import comparison report can show source calculated values beside app results. Divergences remain visible until Matt accepts the agreed rule. Do not silently “correct” historical source values.

## 11. Architecture and operational requirements

Recommended baseline: React + TypeScript + Vite; Tailwind CSS and accessible reusable components; Cloudflare Pages; Supabase PostgreSQL/Auth/private Storage; Supabase Edge Functions and database functions for privileged transactions; existing Resend account; private GitHub repository.

Normal user operations use authenticated requests governed by database policies. Privileged credentials stay on the server. Invitations, import commits, and publish transactions validate authorization and their full input graph.

For normal-sized uploads, a browser worker may perform bounded parsing. A parsed result is still untrusted input and is revalidated before database commit. Benchmark this path before choosing packages and final limits. No heavy background-worker infrastructure is necessary unless representative files justify it.

### Nonfunctional requirements

| ID | Requirement |
|---|---|
| NFR-01 | Row-level security and private storage cover all sensitive tables/objects, including read views and derived summaries; test direct API requests |
| NFR-02 | No database secret/service-role key or Resend secret appears in the browser bundle or source repository |
| NFR-03 | Online logging handles failures, retries, stale revisions, and refreshes with clear status; no false “saved” confirmation |
| NFR-04 | Target Home useful-content rendering within 3 seconds on a representative midrange phone/normal connection with a warm backend; log-save acknowledgement within 2 seconds under pilot conditions; report paused-backend recovery separately |
| NFR-05 | Parse representative small files within 10 seconds where feasible; show progress/cancel; enforce bounded failure at the configured timeout rather than freezing the UI |
| NFR-06 | Keyboard-operable forms/editor flows, labeled controls, WCAG AA contrast targets, readable text, reduced-motion support, and no page-level horizontal overflow at 320px |
| NFR-07 | No real client data in demos, automated fixtures, screenshots, source code, or public previews; production and test data are separate |
| NFR-08 | Capture operational errors without sensitive payloads; document backup, restore, access revocation, failed-import cleanup, and incident handling |
| NFR-09 | Initial recovery objectives: daily verified backup coverage, recovery point up to 24 hours, operator-guided restoration target one business day; these are operational targets, not provider guarantees |
| NFR-10 | Keep schema migrations, lockfile, calculation definitions, parser profiles, and environment instructions versioned and reproducible |

## 12. Starting infrastructure and costs

Official pages checked November 16, 2026; recheck before deployment.

- **Cloudflare Pages Free:** static requests are free and unlimited. Build/file limits apply; 500 builds/month is the published free build allowance. No application server on Pages is required for the proposed static portal. See [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) and [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/).
- **Supabase Free:** 500 MB database, 1 GB file storage, 50,000 monthly active users, 5 GB egress plus 5 GB cached egress; up to two active free projects, with pausing after one week of inactivity. Suitable as the initial pilot assumption, not an uptime commitment. Pro starts at USD $25/month if later needed. See [Supabase pricing](https://supabase.com/pricing).
- **Resend:** reuse the existing account and configure custom SMTP. The default Supabase mail service is testing-oriented and recipient-restricted. See [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
- **Backups:** free-tier operations need explicit exports; database backups do not substitute for separately backed-up stored files. See [Supabase backups](https://supabase.com/docs/guides/platform/backups).
- **Vercel alternative:** Hobby is personal/noncommercial; do not assume it is a free business-hosting option. See [Vercel pricing](https://vercel.com/pricing).

Custom domain registration and future usage upgrades are separate costs. Monitor storage, bandwidth, database growth, email delivery, and pauses; user count is unlikely to be the first constraint. Matt should own the production service accounts and grant collaborators access.

## 13. Success criteria and pilot measurement

These are proposed acceptance targets, not measured results or traffic forecasts.

- In a guided pilot, clients can locate the next action without explanation.
- A returning client can enter a routine nutrition record in about one minute and a normal workout set in about 15 seconds after reaching the form; measure and adjust interface friction.
- Matt can create/duplicate and publish a normal training day in either editing view without switching to Excel.
- Every meaningful item in the representative import corpus is mapped, explicitly excluded, or flagged; there is zero known silent loss in that corpus.
- No critical permission leak, silent overwrite, duplicate commit, or history mutation exists in the release acceptance suite.
- Matt completes migration of representative personal training, mesocycle, and nutrition files and approves the reviewed results.
- Backup restoration is demonstrated on a clean test environment before onboarding the wider client base.

Collect minimal operational events such as save success/failure, parse duration, issue category counts, commit retries, and invitation delivery failures. Do not introduce third-party behavioral analytics merely to populate a dashboard.

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Variations exceed known templates | Profile-based recognition, source excerpts, corrections/exclusions, unsupported-layout fallback |
| Spreadsheet corruption changes meaning | Preserve raw types/text/formulas; contextual range/date review; no automatic guessing |
| Historical values become prescriptions | Explicit classification and history mode; separate target/result tables |
| Template change rewrites history | Immutable published revisions and session snapshots |
| Grid and Program views diverge | One typed draft model and one persistence path |
| Client data leaks through joins/files | Database/storage policies, protected roles, direct API isolation tests |
| Repeated import duplicates data | Per-client fingerprints, overlap checks, idempotent commit |
| Free project pauses or quotas fill | Clear operational status, monitoring, documented restore/upgrade path |
| Domain formulas are inconsistent | Matt-reviewed definitions, independently calculated fixtures, discrepancy report |
| Plan expands into an Excel clone | Fixed structured fields, bounded paste, no arbitrary formulas/layout editing |

## 15. Decisions to resolve during implementation discovery

Use the defaults above to progress; do not block unrelated implementation on these items.

1. Confirm the final logo/font assets and exact terminology with Matt.
2. Review a representative anonymized corpus, including at least one altered-layout file for each family.
3. Confirm exercise alternatives, fractional set attribution, decimal rep meaning, feedback timing, and accepted notation vocabulary.
4. Confirm the agreed weight-change baseline, period averages, and energy-balance estimate before publishing those metrics to clients.
5. Confirm client timezones, weight/load unit defaults, workout scheduling expectations, and check-in cadence.
6. Confirm source-file, failed-upload, inactive-client, and account-deletion retention policy before pilot. Proposed operational default: failed/orphaned uploads removed after seven days; successful source files retained while the client relationship is active, subject to Matt's confirmed policy.
7. Choose the Supabase region with Matt based on the actual business/client location and account requirements; do not infer a jurisdiction solely from this chat's timezone.
8. Establish a support contact, production account ownership, and pilot client list.

## 16. Release acceptance checklist

- [ ] All three service workflows are usable and service-specific navigation works.
- [ ] Client Home tasks derive from real saved assignments/logs.
- [ ] Program/Grid share saved draft state; paste validation and edit conflicts work.
- [ ] Publishing preserves completed and in-progress history.
- [ ] Training/nutrition logs survive refresh and handle network failures visibly.
- [ ] RIR `1-2` remains a range in the editor, imports, storage, and client view.
- [ ] `.xlsx` and `.docx` imports cover the supplied families and representative layout variations.
- [ ] All meaningful import issues require resolution or explicit exclusion.
- [ ] Historical results/dates are reviewed separately from future targets.
- [ ] Duplicate/retry/failure cases produce no partial programs or duplicate history.
- [ ] Real direct-request security tests pass for client A, client B, disabled clients, staff, anonymous users, and files.
- [ ] Resend invitations and recovery work with real configured delivery.
- [ ] Mobile and keyboard flows pass the defined checks.
- [ ] Matt approves calculations and representative migration results.
- [ ] Backups, storage recovery, monitoring, and rollback procedures are exercised.
- [ ] No placeholder demo service is presented as production functionality.

## 17. Reference hierarchy

The user's explicit decisions, especially range semantics, take precedence over accidental Excel formatting. This PRD defines intended product behavior; the companion roadmap defines sequencing and proposed engineering choices. Original templates provide content and evidence, while mockups provide design direction. When these conflict, record the discrepancy and resolve it explicitly instead of silently changing the product.

Technical access-control reference: [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
