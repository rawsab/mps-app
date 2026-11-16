# 0001 — Stack and tooling

Date: 2026-11-16 · Status: accepted

## Context

The repository had no code, only the PRD, roadmap, brand assets and three anonymized sample files. The roadmap (§3) proposes React/TypeScript/Vite, Tailwind, Supabase and Cloudflare Pages. The local machine has Node 22.18.

## Decision

| Concern | Choice (pinned) | Notes |
|---|---|---|
| Package manager | pnpm 11.9 | npm 10.9.3 crashed (`Cannot read properties of null (reading 'edgesOut')`) resolving vitest's peer set; pnpm resolves it cleanly. `pnpm-lock.yaml` is committed. |
| App | React 19.3.1, Vite 8.3.5, TypeScript 7.0.2 | |
| Routing | react-router 7.18.5 | v8 requires Node ≥ 22.22; local Node is 22.18. |
| Styling | Tailwind 4.3.3 (`@tailwindcss/vite`) | Tokens in `src/index.css` `@theme`. |
| Validation | zod 4.6.7 | Shared by domain contracts and forms. React Hook Form was not added; current forms are small. Revisit for the M3 editors. |
| Remote state | @tanstack/react-query 5.105.1 | |
| Backend | Supabase CLI 2.122.0 (npm devDependency), Postgres 17 locally | `supabase-js` 2.118.0. |
| Tests | Vitest 5.0.5 (unit + api projects), pgTAP via `supabase test db` | Playwright is still to be added as a project dependency (M2/M8). |
| Type | Hanken Grotesk (variable), self-hosted via `@fontsource-variable/hanken-grotesk` 5.3.0 (OFL-1.1) | Self-hosted so client sessions make no requests to a font CDN. |
| OOXML parsing | fflate 0.8.3 (zip) + fast-xml-parser 5.12.1 | See 0003. |

Version policy: the newest release at least ~2 weeks old, compatible with Node 22.18, MIT/ISC/Apache-2.0 licensed. Exception: fast-xml-parser 5.12.1 (3 days old) was taken because 5.11.2 has advisory GHSA-474x-hrwr-fgx4 (quadratic CPU on hostile input). Hostile uploads are exactly the importer's threat model.

## Consequences

- Upgrade Node to ≥ 22.22 before moving to react-router 8.
- `pnpm audit` reported 0 known vulnerabilities at install time.
- The main bundle is ~680 kB (197 kB gzip). Route-level code splitting is a later optimization, not blocking.
