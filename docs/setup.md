# Local setup and verification

## Prerequisites

- Node ≥ 22.12 (developed on 22.18) and pnpm 11 (`corepack enable` provides it)
- Docker Desktop running (the local Supabase stack runs in containers)
- No hosted accounts are needed for local work.

## First run

```sh
pnpm install
pnpm db:start            # starts local Supabase (first run pulls images, several minutes)
pnpm db:reset            # applies supabase/migrations and the fictional local seed in supabase/seed.sql
pnpm exec supabase functions serve   # separate terminal: serves supabase/functions locally
```

Create `.env.local` (gitignored) from the running stack:

```sh
pnpm exec supabase status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY)='
# then write:
# VITE_SUPABASE_URL=<API_URL>
# VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY>
pnpm dev                 # http://127.0.0.1:5173
```

If either variable is missing, or a secret/service-role key is supplied, the app shows a configuration error. It never falls back to demo data.

## Synthetic accounts (local only)

Password for all: `local-dev-only-password`

| Email | Role | Notes |
|---|---|---|
| matt@example.test (Matt Lizmore) | admin | Sees and manages all 12 clients |
| priya.nair@example.test (Priya Nair) | coach | Assigned to Maya Chen and Grace Liu only |
| liam.oconnor@example.test (Liam O'Connor) | coach | No assignments; sees nothing |
| maya.chen@example.test | client (active) | Mesocycle + nutrition |
| daniel.okafor@example.test | client (active) | Personal training only |
| aisha.rahman@example.test | client (active) | Personal training + nutrition |
| grace.liu@example.test | client (active) | Mesocycle + personal training |
| hannah.kowalski@example.test | client (active) | Nutrition; mesocycle ended |
| owen.fitzgerald@example.test | client (active) | Nutrition paused (Europe/London) |
| lucas.silva@example.test | client (invited) | Becomes active on first sign-in |
| sofia.marquez@example.test, ryan.patel@example.test | client (disabled) | See "No active access" |
| (no login) Ethan Brooks, Noah Tremblay, Zara Ahmed | client records (pending) | Use them to test invitations |

The people are fictional. All emails use the reserved `example.test` domain, so invitations and resets can't reach a real inbox.

Invitation and password-reset emails go to the local Mailpit inbox at http://127.0.0.1:54324. Nothing leaves the machine.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` / Pages build env | Supabase API URL (browser-safe) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local` / Pages build env | Publishable/anon key (browser-safe; RLS enforces access) |
| `APP_ORIGINS` | Edge Function secret | Comma-separated allowed app origins for CORS and invitation redirects. Defaults to local 5173 origins. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Edge Function runtime | Injected by Supabase. Never put them in `VITE_*` or the repo. |
| `SUPABASE_TEST_URL`, `SUPABASE_TEST_PUBLISHABLE_KEY` | optional, `pnpm test:api` | Override the auto-detected local stack |

## Verification

```sh
pnpm verify          # typecheck + unit tests + production build
pnpm test:db         # pgTAP policy tests (local stack + seed)
pnpm db:reset && pnpm test:api   # direct HTTP isolation tests with real sign-ins
pnpm spike:import    # importer spike on samples/ → reports/ (gitignored)
```

`test:api` modifies Client A's status during the run and restores it. Run `pnpm db:reset` first for a known state.

## Hosted environments (not done; needs authorization)

Before any hosted deployment, someone with Matt's authorization needs to:

1. Create separate test and production Supabase projects. Matt chooses the region (PRD §15.7).
2. Run `supabase link` and `supabase db push`, then deploy `invite-client` and set `APP_ORIGINS`.
3. Configure Resend as custom SMTP in each project (Auth → SMTP). Verify the sender domain DNS.
4. Set Site URL and redirect URLs to `<app origin>/auth/callback`. Keep sign-up disabled.
5. Create the first admin. Invite the account from the Supabase dashboard, then run `insert into staff_roles (auth_user_id, role) values ('<id>', 'admin');`.
6. Create the Cloudflare Pages project with build command `pnpm build`, output `dist`, and the two `VITE_*` variables. `public/_redirects` already provides the SPA deep-link fallback.
