<p align="center">
  <img src="public/logo/mps-full-logo.png" alt="Modern Physique Systems" width="360">
</p>

<p align="center">
  The client and coaching web application for Modern Physique Systems
</p>

<p align="center">
  <img alt="Status: in active development" src="https://img.shields.io/badge/status-in%20active%20development-c9a24a">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React%2019-20232a?logo=react&logoColor=61dafb">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres-3ecf8e?logo=supabase&logoColor=white">
</p>

---

## About

[Modern Physique Systems](#ownership-and-intellectual-property) (MPS) is a coaching business run by Matt Lizmore. It offers three services: Mesocycle Programming, Nutritional Programming and Personal Training. Its programs and client results currently live in spreadsheets and documents. This application replaces them with a single branded, mobile-friendly platform:

- **Coaches** manage clients, build and publish programs, review logged activity, schedule sessions and track billing.
- **Clients** sign in to see what to do next, log workouts and nutrition from their phone, and follow their progress over time.

I'm designing and building the application for MPS, and the business owner has allowed me to share it publicly here.

> **Work in progress.** The application is under active development and this is not the final version. Features are still being built and refined, and the interface, data model and workflows may change before release.

## Ownership and intellectual property

The **Mesocycle Programming**, **Nutritional Programming** and **Personal Training** services, including their programs, templates, training and nutrition methodologies, program content, and coaching workflows, are the intellectual property of **Modern Physique Systems**. The same applies to the Modern Physique Systems name, logo and branding.

They appear in this repository with the owner's permission, for portfolio purposes only. Nothing here grants a licence to use, copy or redistribute that material. All people and data in the local development seed are fictional.

## Features

### For coaches

- **Client management.** Invite clients, enroll them in one or more services, transfer them between coaches, and archive ended services while keeping their history.
- **Two program editors over one model.** A structured *Program* view and a spreadsheet-style *Grid* view edit the same canonical program. The grid supports keyboard navigation, range selection, drag-to-reorder, copy and paste, context menus, and undo/redo shared across both views.
- **Draft, publish and revise.** Drafts autosave. Publishing creates an immutable revision, so a client's completed history is never rewritten when their program changes.
- **Nutritional programming.** Targets with effective dates, a coach-editable daily log, weekly averages and calorie balances, and weight-trend charts.
- **Reviews and activity.** A feed of client workouts, nutrition entries and feedback, with read state and summary trends.
- **Scheduling.** Personal-training sessions, recurring meetings, coach availability, attendance records, and client requests to book, move or cancel sessions.
- **Billing.** Monthly programming charges, per-session PT pricing and recorded payments, all handled in integer cents.

### For clients

- A home screen centred on the next action, with navigation filtered to the services they're enrolled in.
- Set-by-set workout logging against the prescribed targets (weights, reps, RIR/RPE ranges), plus muscle-group totals and optional session feedback.
- Daily weigh-ins and nutrition logging, with weekly summaries.
- A Personal Training dashboard with upcoming sessions and requests.
- Profile settings and light and dark themes.

### Spreadsheet importer

A migration pipeline, currently in development, turns MPS's existing Excel and Word templates into structured program data. It parses the files directly and never evaluates formulas or macros. Every source item ends up *mapped*, *excluded* (with a reason) or *unresolved* (with an issue for the coach to review), and nothing is applied without the coach's confirmation. The importer has no DOM dependencies, so the same code runs in Node tests and can run in a browser Web Worker.

## Tech stack

| Layer | Tools |
|---|---|
| Front end | React 19, TypeScript, Vite, React Router 7, TanStack Query, Tailwind CSS 4 |
| Validation | Zod 4 at every boundary (forms, API responses, import contracts) |
| Back end | Supabase: Postgres with row-level security, Auth, Storage, Edge Functions (Deno) |
| Testing | Vitest (domain and importer unit tests, HTTP isolation tests), pgTAP (database policy tests) |
| Tooling | pnpm, Supabase CLI, Docker for the local stack |

## Engineering highlights

- **Authorization lives in the database.** Every table, view, function and storage bucket ships with row-level security policies, explicit grants and pgTAP tests in the same migration. Policy helpers run as `security definer` functions in a private schema. Route guards in the UI are a convenience, not a security boundary.
- **Immutability enforced at the data layer.** Published program revisions and session target snapshots can't be modified, and the database enforces this rather than application code.
- **Domain correctness.** Prescribed targets and actual results are stored separately. An RIR of `1-2` is a numeric range, not a date that Excel misread. A null value means "not answered" and is never treated as zero. Money is stored as integer cents.
- **Server-side identity binding.** Client accounts are linked to client records only by an Edge Function during the invitation flow, never by browser input or a matching email address.
- **Shared component library.** Pages are built from a shared set of accessible components (dialogs, menus, form fields, tabs, charts with screen-reader tables) and theme tokens, so light and dark modes stay consistent.
- **Recorded decisions.** Over 50 short architecture decision records in [`docs/decisions/`](docs/decisions/) explain the reasoning behind significant design choices.

## Project structure

```text
src/
  app/          Routing, auth context, route guards and layouts
  components/   Shared UI component library
  domain/       Framework-free business logic (programs, training, nutrition, scheduling, billing, importer)
  features/     Feature modules (clients, programs, training, nutrition, scheduling, billing, ...)
  lib/          Supabase client and environment validation
supabase/
  migrations/   Schema, RLS policies and database functions
  functions/    Edge Functions (client invitations)
  tests/        pgTAP policy and behaviour tests
tests/          Vitest suites: domain, importer and API isolation
docs/           Product requirements, roadmap, setup guide and decision records
```

## Running locally

Prerequisites: Node 22.12 or later, pnpm 11 and Docker. No hosted accounts are needed.

```sh
pnpm install
pnpm db:start     # start the local Supabase stack
pnpm db:reset     # apply migrations and the fictional seed data
pnpm dev          # after creating .env.local (see docs/setup.md)
```

```sh
pnpm verify       # typecheck, unit tests and production build
pnpm test:db      # database policy tests (pgTAP)
pnpm test:api     # HTTP isolation tests against the local stack
```

See [`docs/setup.md`](docs/setup.md) for environment configuration, the local seed accounts and Edge Function setup.

## Documentation

- [Product requirements](docs/modern-physique-systems-prd.md)
- [Implementation roadmap](docs/modern-physique-systems-implementation-roadmap.md)
- [Development status](docs/status.md)
- [Decision records](docs/decisions/)

---

<sub>© Modern Physique Systems. The Modern Physique Systems name, logo, services and program content are the property of Modern Physique Systems and are shown here with permission.</sub>
